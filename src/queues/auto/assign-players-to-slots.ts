import type { QueueSlotModel } from '../../database/models/queue-slot.model'
import type { QueueSlotId } from '../types/queue-slot-id'
import type { SteamId64 } from '../../shared/types/steam-id-64'
import type { Tf2ClassName } from '../../shared/types/tf2-class-name'

export interface PlayerClassAvailability {
  steamId: SteamId64
  availableClasses: readonly Tf2ClassName[]
  currentSlotId?: QueueSlotId
}

/**
 * Finds a complete assignment of queued players to the queue's fixed class slots.
 *
 * Existing assignments are preferred, but an augmenting path can move a flexible player when
 * that is necessary to make room for someone who can only play a narrower set of classes.
 */
export function assignPlayersToSlots(
  slots: readonly Pick<QueueSlotModel, 'id' | 'gameClass'>[],
  players: readonly PlayerClassAvailability[],
): Map<QueueSlotId, SteamId64> | null {
  if (players.length > slots.length) {
    return null
  }

  const playerIds = new Set(players.map(({ steamId }) => steamId))
  if (playerIds.size !== players.length) {
    return null
  }

  const edges = new Map<SteamId64, QueueSlotId[]>()
  for (const player of players) {
    const candidates = slots
      .filter(slot => player.availableClasses.includes(slot.gameClass))
      .sort((a, b) => {
        const aIsCurrent = a.id === player.currentSlotId
        const bIsCurrent = b.id === player.currentSlotId
        if (aIsCurrent !== bIsCurrent) {
          return aIsCurrent ? -1 : 1
        }
        return a.id.localeCompare(b.id)
      })
      .map(({ id }) => id)

    if (candidates.length === 0) {
      return null
    }
    edges.set(player.steamId, candidates)
  }

  const occupants = new Map<QueueSlotId, SteamId64>()

  function seat(player: SteamId64, visited: Set<QueueSlotId>): boolean {
    for (const slot of edges.get(player) ?? []) {
      if (visited.has(slot)) {
        continue
      }
      visited.add(slot)

      const occupant = occupants.get(slot)
      if (occupant === undefined || seat(occupant, visited)) {
        occupants.set(slot, player)
        return true
      }
    }

    return false
  }

  for (const { steamId } of players) {
    if (!seat(steamId, new Set())) {
      return null
    }
  }

  return occupants
}
