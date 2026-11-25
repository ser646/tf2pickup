import { configuration } from '../../configuration'
import { collections } from '../../database/collections'
import type { QueueId } from '../../database/models/queue.model'
import type { QueueSlotModel } from '../../database/models/queue-slot.model'
import { QueueState } from '../../database/models/queue-state.model'
import { errors } from '../../errors'
import { logger } from '../../logger'
import { players } from '../../players'
import { preReady } from '../../pre-ready'
import type { SteamId64 } from '../../shared/types/steam-id-64'
import type { Tf2ClassName } from '../../shared/types/tf2-class-name'
import { getState } from '../get-state'
import { withLogLevel } from '../../utils/with-log-level'
import { joinBlocker } from './join-blocker'
import { queueCommand } from '../queue-command'
import type { QueueSlotId } from '../types/queue-slot-id'
import { playerAvatarUrl } from '../../shared/player-avatar-url'
import { get } from '../get'
import { vacateSlot } from './vacate-slot'
import { leavePools } from '../captain/leave-pools'
import { assertAutoQueue } from './assert-auto-queue'
import { gamemodeConfigs } from '../../gamemodes/configs'
import { assignPlayersToSlots } from './assign-players-to-slots'

interface QueueMember {
  player: NonNullable<QueueSlotModel['player']>
  ready: boolean
  availableClasses: Tf2ClassName[]
  currentSlotId?: QueueSlotId
}

export async function join(
  queue: QueueId,
  slotId: QueueSlotId,
  steamId: SteamId64,
  selectedClasses: readonly Tf2ClassName[] = [],
): Promise<QueueSlotModel[]> {
  logger.trace({ queue, steamId, slotId, selectedClasses }, 'queue.join()')
  const settings = await get(queue)
  assertAutoQueue(settings)
  const player = await players.bySteamId(steamId, [
    'hasAcceptedRules',
    'bans',
    'activeGame',
    'skill',
    'steamId',
    'name',
    'avatar.medium',
    'verified',
  ])

  const defaultSkill = (await configuration.get('games.default_player_skill'))[settings.gamemode]

  return await queueCommand('join', async emit => {
    const state = await getState(queue)
    if (![QueueState.waiting, QueueState.ready].includes(state)) {
      throw withLogLevel(errors.badRequest('invalid queue state'), 'debug')
    }

    const slots = await collections.queueSlots.find({ queue }, { sort: { _id: 1 } }).toArray()
    const clickedSlot = slots.find(slot => slot.id === slotId)
    if (!clickedSlot) {
      throw errors.notFound('no such slot')
    }

    if (
      selectedClasses.length === 0 &&
      clickedSlot.player &&
      clickedSlot.player.steamId !== steamId
    ) {
      throw withLogLevel(errors.badRequest('slot occupied'), 'debug')
    }

    const configuredClasses = gamemodeConfigs[settings.gamemode].classes.map(({ name }) => name)
    const requestedClasses = [
      ...new Set(selectedClasses.length > 0 ? selectedClasses : [clickedSlot.gameClass]),
    ]
    const invalidClass = requestedClasses.find(gameClass => !configuredClasses.includes(gameClass))
    if (invalidClass) {
      throw errors.badRequest('class ' + invalidClass + ' is not available in this queue')
    }

    const globalBlocker = joinBlocker(
      player,
      { gameClass: requestedClasses[0]! },
      settings,
      defaultSkill,
      { skipSkillThreshold: true },
    )
    if (globalBlocker) {
      throw errors.badRequest(globalBlocker)
    }

    // Skill thresholds can differ by class. Keep only the classes this player is currently
    // eligible to play; the same checks are repeated here even though the UI disables them.
    const availableClasses = requestedClasses.filter(
      gameClass => !joinBlocker(player, { gameClass }, settings, defaultSkill),
    )
    if (availableClasses.length === 0) {
      const blocker = joinBlocker(player, { gameClass: requestedClasses[0]! }, settings, defaultSkill)
      throw errors.badRequest(blocker ?? 'You are not eligible for the selected classes')
    }

    const ownSlot = slots.find(slot => slot.player?.steamId === steamId)
    const members = new Map<SteamId64, QueueMember>()
    for (const slot of slots) {
      if (!slot.player) {
        continue
      }
      members.set(slot.player.steamId, {
        player: slot.player,
        ready: slot.ready,
        availableClasses: slot.availableClasses ?? [slot.gameClass],
        currentSlotId: slot.id,
      })
    }

    members.set(steamId, {
      player: ownSlot?.player ?? {
        steamId: player.steamId,
        name: player.name,
        avatarUrl: playerAvatarUrl(player.avatar, 'medium'),
      },
      ready:
        state === QueueState.ready
          ? (ownSlot?.ready ?? true)
          : false,
      availableClasses,
      currentSlotId: ownSlot?.id,
    })

    const assignment = assignPlayersToSlots(
      slots,
      [...members].map(([memberSteamId, member]) => ({
        steamId: memberSteamId,
        availableClasses: member.availableClasses,
        currentSlotId: member.currentSlotId,
      })),
    )
    if (!assignment) {
      throw errors.badRequest(
        'No valid class assignment is available. Try selecting more classes.',
      )
    }

    // Check the new assignment before leaving another queue, so an impossible combination never
    // costs the player their existing place.
    if (
      await collections.queueSlots.countDocuments({
        queue: { $ne: queue },
        'player.steamId': steamId,
      })
    ) {
      await vacateSlot(steamId, emit)
    }
    await leavePools(steamId, emit)

    const changed: QueueSlotModel[] = []
    const finalSlots: QueueSlotModel[] = []
    for (const slot of slots) {
      const assignedSteamId = assignment.get(slot.id)
      const member = assignedSteamId ? members.get(assignedSteamId) : undefined
      const nextPlayer = member?.player ?? null
      const nextReady = member?.ready ?? false
      const currentClasses = slot.availableClasses ?? (slot.player ? [slot.gameClass] : [])
      const nextClasses = member?.availableClasses ?? []
      const classesChanged =
        currentClasses.length !== nextClasses.length ||
        currentClasses.some((gameClass, index) => gameClass !== nextClasses[index])
      const playerChanged =
        slot.player?.steamId !== nextPlayer?.steamId ||
        slot.player?.name !== nextPlayer?.name ||
        slot.player?.avatarUrl !== nextPlayer?.avatarUrl
      const readyChanged = slot.ready !== nextReady

      if (!playerChanged && !readyChanged && !classesChanged) {
        finalSlots.push(slot)
        continue
      }

      const update = member
        ? {
            $set: {
              player: nextPlayer,
              ready: nextReady,
              availableClasses: member.availableClasses,
            },
          }
        : {
            $set: { player: null, ready: false },
            $unset: { availableClasses: '' },
          }
      const updated = await collections.queueSlots.findOneAndUpdate(
        { _id: slot._id },
        update,
        { returnDocument: 'after' },
      )
      if (!updated) {
        throw errors.internalServerError('failed to update queue slot')
      }
      changed.push(updated)
      finalSlots.push(updated)
    }

    // A friendship is only valid while its source and target still occupy compatible classes.
    const friendships = await collections.queueFriends.find({ queue }).toArray()
    const slotsByPlayer = new Map(
      finalSlots.flatMap(slot => (slot.player ? [[slot.player.steamId, slot] as const] : [])),
    )
    for (const friendship of friendships) {
      const source = slotsByPlayer.get(friendship.source)
      const target = slotsByPlayer.get(friendship.target)
      if (source && target && !source.canMakeFriendsWith?.includes(target.gameClass)) {
        await collections.queueFriends.deleteOne({ queue, source: friendship.source })
        emit('queue/friendship:removed', {
          queue,
          source: friendship.source,
          target: friendship.target,
        })
      }
    }

    await collections.queueState.updateOne({ queue }, { $set: { last: steamId } })
    if (state === QueueState.ready && !ownSlot) {
      await preReady.start(steamId)
    }

    if (changed.length > 0) {
      emit('queue/slots:updated', { queue, slots: changed })
    }
    return changed
  })
}
