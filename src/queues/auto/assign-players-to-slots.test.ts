import { describe, expect, it, vi } from 'vitest'
import type { QueueSlotId } from '../types/queue-slot-id'
import type { SteamId64 } from '../../shared/types/steam-id-64'
import { Tf2ClassName } from '../../shared/types/tf2-class-name'
import { assignPlayersToSlots } from './assign-players-to-slots'

const scout = 'scout-1' as QueueSlotId
const soldier = 'soldier-1' as QueueSlotId
const scoutPlayer = '76561198000000001' as SteamId64
const soldierPlayer = '76561198000000002' as SteamId64

const slots = [
  { id: scout, gameClass: Tf2ClassName.scout },
  { id: soldier, gameClass: Tf2ClassName.soldier },
]

describe('assignPlayersToSlots()', () => {
  it('assigns a player to a slot for one of their available classes', () => {
    expect(
      assignPlayersToSlots(slots, [
        { steamId: scoutPlayer, availableClasses: [Tf2ClassName.scout] },
      ]),
    ).toEqual(new Map([[scout, scoutPlayer]]))
  })

  it('moves a flexible player to make room for a class specialist', () => {
    expect(
      assignPlayersToSlots(slots, [
        {
          steamId: scoutPlayer,
          availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier],
          currentSlotId: soldier,
        },
        {
          steamId: soldierPlayer,
          availableClasses: [Tf2ClassName.soldier],
        },
      ]),
    ).toEqual(
      new Map([
        [scout, scoutPlayer],
        [soldier, soldierPlayer],
      ]),
    )
  })

  it('randomizes the alternate class chosen when a flexible player must move', () => {
    const medic = 'medic-1' as QueueSlotId
    const expandedSlots = [...slots, { id: medic, gameClass: Tf2ClassName.medic }]
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)

    try {
      const assignment = assignPlayersToSlots(expandedSlots, [
        {
          steamId: scoutPlayer,
          availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier, Tf2ClassName.medic],
          currentSlotId: soldier,
        },
        {
          steamId: soldierPlayer,
          availableClasses: [Tf2ClassName.soldier],
        },
      ])

      expect(assignment).toEqual(
        new Map([
          [scout, scoutPlayer],
          [soldier, soldierPlayer],
        ]),
      )
    } finally {
      random.mockRestore()
    }
  })

  it('preserves an existing assignment when it does not need to move', () => {
    expect(
      assignPlayersToSlots(slots, [
        {
          steamId: scoutPlayer,
          availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier],
          currentSlotId: soldier,
        },
        {
          steamId: soldierPlayer,
          availableClasses: [Tf2ClassName.scout],
        },
      ]),
    ).toEqual(
      new Map([
        [soldier, scoutPlayer],
        [scout, soldierPlayer],
      ]),
    )
  })

  it('returns null when no complete assignment exists', () => {
    expect(
      assignPlayersToSlots(slots, [
        { steamId: scoutPlayer, availableClasses: [Tf2ClassName.scout] },
        { steamId: soldierPlayer, availableClasses: [Tf2ClassName.scout] },
      ]),
    ).toBeNull()
  })

  it('rejects duplicate players and more players than slots', () => {
    expect(
      assignPlayersToSlots(slots, [
        { steamId: scoutPlayer, availableClasses: [Tf2ClassName.scout] },
        { steamId: scoutPlayer, availableClasses: [Tf2ClassName.soldier] },
      ]),
    ).toBeNull()
    expect(
      assignPlayersToSlots(slots, [
        { steamId: scoutPlayer, availableClasses: [Tf2ClassName.scout] },
        { steamId: soldierPlayer, availableClasses: [Tf2ClassName.soldier] },
        {
          steamId: '76561198000000003' as SteamId64,
          availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier],
        },
      ]),
    ).toBeNull()
  })
})
