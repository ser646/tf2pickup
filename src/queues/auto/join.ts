import type { UpdateFilter } from 'mongodb'
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
import { joinSingleClass } from './join-single-class'
import { VoiceServerType } from '../../shared/types/voice-server-type'

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
  if (!settings.allowMultipleClasses) {
    return await joinSingleClass(queue, slotId, steamId)
  }
  const player = await players.bySteamId(steamId, [
    'hasAcceptedRules',
    'bans',
    'activeGame',
    'skill',
    'steamId',
    'name',
    'avatar.medium',
    'verified',
    'discordLink',
  ])

  const defaultSkill = (await configuration.get('games.default_player_skill'))[settings.gamemode]
  const requireDiscordLink =
    (await configuration.get('games.voice_server_type')) === VoiceServerType.discord

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

    const configuredClasses = gamemodeConfigs[settings.gamemode].classes.map(({ name }) => name)
    // The clicked class heading chooses the primary class. Submitted checkboxes
    // represent only additional classes the player is also willing to play.
    const requestedClasses = [...new Set([clickedSlot.gameClass, ...selectedClasses])]
    const invalidClass = requestedClasses.find(gameClass => !configuredClasses.includes(gameClass))
    if (invalidClass) {
      throw errors.badRequest('class ' + invalidClass + ' is not available in this queue')
    }

    // The clicked heading is the requested primary class, so it must be playable.
    // Alternate eligibility must never silently turn a rejected primary selection into another class.
    const primaryBlocker = joinBlocker(player, clickedSlot, settings, defaultSkill, requireDiscordLink)
    if (primaryBlocker) {
      throw errors.badRequest(primaryBlocker)
    }

    // Skill thresholds can differ by class. Keep only the classes this player is currently
    // eligible to play; the same checks are repeated here even though the UI disables them.
    const availableClasses = requestedClasses.filter(
      gameClass => !joinBlocker(player, { gameClass }, settings, defaultSkill, requireDiscordLink),
    )
    if (availableClasses.length === 0) {
      const blocker = joinBlocker(
        player,
        { gameClass: requestedClasses[0]! },
        settings,
        defaultSkill,
        requireDiscordLink,
      )
      throw errors.badRequest(blocker ?? 'You are not eligible for the selected classes')
    }
    if (
      clickedSlot.player &&
      clickedSlot.player.steamId !== steamId &&
      !availableClasses.includes(clickedSlot.gameClass)
    ) {
      const blocker = joinBlocker(player, clickedSlot, settings, defaultSkill, requireDiscordLink)
      throw errors.badRequest(blocker ?? 'You are not eligible for this class')
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
      ready: state === QueueState.ready ? (ownSlot?.ready ?? true) : false,
      availableClasses,
      currentSlotId: clickedSlot.id,
    })

    const assignment = assignPlayersToSlots(
      slots,
      [...members].map(([memberSteamId, member]) => ({
        steamId: memberSteamId,
        availableClasses: member.availableClasses,
        ...(member.currentSlotId ? { currentSlotId: member.currentSlotId } : {}),
      })),
    )
    if (!assignment) {
      throw errors.badRequest('No valid class assignment is available. Try selecting more classes.')
    }

    // Check feasibility before leaving another queue, so an impossible combination never costs
    // the player their existing place.
    if (
      await collections.queueSlots.countDocuments({
        queue: { $ne: queue },
        'player.steamId': steamId,
      })
    ) {
      await vacateSlot(steamId, emit)
    }
    await leavePools(steamId, emit)

    const slotChanges = slots.map(slot => {
      const assignedSteamId = assignment.get(slot.id)
      const member = assignedSteamId ? members.get(assignedSteamId) : undefined
      const nextPlayer = member?.player ?? null
      const currentClasses = slot.availableClasses ?? (slot.player ? [slot.gameClass] : [])
      const nextClasses = member?.availableClasses ?? []
      return {
        slot,
        member,
        playerChanged:
          slot.player?.steamId !== nextPlayer?.steamId ||
          slot.player?.name !== nextPlayer?.name ||
          slot.player?.avatarUrl !== nextPlayer?.avatarUrl,
        readyChanged: slot.ready !== (member?.ready ?? false),
        classesChanged:
          currentClasses.length !== nextClasses.length ||
          currentClasses.some((gameClass, index) => gameClass !== nextClasses[index]),
      }
    })

    const finalSlotsById = new Map(slots.map(slot => [slot.id, slot]))
    const changedById = new Map<QueueSlotId, QueueSlotModel>()

    // Vacate moving players first, then fill the destination slots. This avoids transient duplicate
    // memberships when a flexible player has to move for a class specialist.
    for (const { slot, member } of slotChanges) {
      if (!slot.player || slot.player.steamId === member?.player.steamId) {
        continue
      }

      const update: UpdateFilter<QueueSlotModel> = {
        $set: { player: null, ready: false },
        $unset: { availableClasses: '' },
      }
      const updated = await collections.queueSlots.findOneAndUpdate({ _id: slot._id }, update, {
        returnDocument: 'after',
      })
      if (!updated) {
        throw errors.internalServerError('failed to vacate queue slot')
      }
      finalSlotsById.set(updated.id, updated)
      changedById.set(updated.id, updated)
      emit('queue/slots:updated', { queue, slots: [updated] })
    }

    for (const { slot, member, playerChanged, readyChanged, classesChanged } of slotChanges) {
      if (!member || (!playerChanged && !readyChanged && !classesChanged)) {
        continue
      }

      const update: UpdateFilter<QueueSlotModel> = {
        $set: {
          player: member.player,
          ready: member.ready,
          availableClasses: member.availableClasses,
        },
      }
      const updated = await collections.queueSlots.findOneAndUpdate({ _id: slot._id }, update, {
        returnDocument: 'after',
      })
      if (!updated) {
        throw errors.internalServerError('failed to assign queue slot')
      }
      finalSlotsById.set(updated.id, updated)
      changedById.set(updated.id, updated)
      emit('queue/slots:updated', { queue, slots: [updated] })
    }

    // A friendship is only valid while its source and target still occupy compatible classes.
    const finalSlots = [...finalSlotsById.values()]
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

    if (!ownSlot) {
      await collections.queueState.updateOne({ queue }, { $set: { last: steamId } })
    }
    if (state === QueueState.ready && !ownSlot) {
      await preReady.start(steamId)
    }

    return [...changedById.values()]
  })
}
