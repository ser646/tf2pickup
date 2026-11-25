import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../database/collections', () => ({
  collections: {
    queueSlots: {
      find: vi.fn(),
      countDocuments: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
    queueFriends: {
      find: vi.fn(),
      deleteOne: vi.fn(),
    },
    queueState: { updateOne: vi.fn() },
  },
}))
vi.mock('../../logger', () => ({ logger: { trace: vi.fn() } }))
vi.mock('../../players', () => ({ players: { bySteamId: vi.fn() } }))
vi.mock('../../pre-ready', () => ({ preReady: { start: vi.fn() } }))
vi.mock('../get', () => ({ get: vi.fn() }))
vi.mock('../get-state', () => ({ getState: vi.fn() }))
vi.mock('../../configuration', () => ({
  configuration: { get: vi.fn().mockResolvedValue({ '6v6': { scout: 2, soldier: 2 } }) },
}))
vi.mock('./join-blocker', () => ({ joinBlocker: vi.fn().mockReturnValue(null) }))
vi.mock('./vacate-slot', () => ({ vacateSlot: vi.fn() }))
vi.mock('../captain/leave-pools', () => ({ leavePools: vi.fn() }))
vi.mock('../queue-command', () => ({
  queueCommand: vi.fn(async (_operation: string, fn: (emit: unknown) => unknown) => await fn(emit)),
}))

const emit = vi.fn()

import { ObjectId } from 'mongodb'
import { collections } from '../../database/collections'
import type { QueueId } from '../../database/models/queue.model'
import type { QueueSlotModel } from '../../database/models/queue-slot.model'
import { QueueState } from '../../database/models/queue-state.model'
import { players } from '../../players'
import type { SteamId64 } from '../../shared/types/steam-id-64'
import { Tf2ClassName } from '../../shared/types/tf2-class-name'
import { get } from '../get'
import { getState } from '../get-state'
import type { QueueSlotId } from '../types/queue-slot-id'
import { join } from './join'
import { joinBlocker } from './join-blocker'
import { vacateSlot } from './vacate-slot'

const queue = new ObjectId() as QueueId
const steamId = '76561198000000001' as SteamId64
const otherSteamId = '76561198000000002' as SteamId64
const slotId = 'scout-1' as QueueSlotId
const otherSlotId = 'soldier-1' as QueueSlotId
type DbSlot = QueueSlotModel & { _id: ObjectId }
const slot: DbSlot = {
  _id: new ObjectId(),
  queue,
  id: slotId,
  gameClass: Tf2ClassName.scout,
  player: null,
  ready: false,
}
const player = {
  steamId,
  name: 'player',
  hasAcceptedRules: true,
  avatar: { medium: 'avatar' },
  bans: [{ end: new Date(Date.now() + 60_000) }],
}

function cursor(slots: unknown[]) {
  return { toArray: vi.fn().mockResolvedValue(slots) }
}

function mockUpdates(slots: DbSlot[]) {
  vi.mocked(collections.queueSlots.findOneAndUpdate).mockImplementation((async (
    filter: { _id: ObjectId },
    update: Record<string, unknown>,
  ) => {
    const original = slots.find(candidate => candidate._id.equals(filter._id))
    if (!original) {
      return null
    }
    return {
      ...original,
      ...(update.$set as object),
    }
  }) as never)
}

describe('join()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(get).mockResolvedValue({
      enabled: true,
      requireVerification: false,
      skillThreshold: null,
      gamemode: '6v6',
      launchMode: 'auto',
    } as never)
    vi.mocked(joinBlocker).mockReturnValue(null)
    vi.mocked(players.bySteamId).mockImplementation((async (_: SteamId64, keys: string[]) =>
      Object.fromEntries(
        Object.entries(player).filter(([key]) => keys.some(k => k.split('.')[0] === key)),
      )) as never)
    vi.mocked(getState).mockResolvedValue(QueueState.waiting)
    vi.mocked(collections.queueSlots.find).mockReturnValue(cursor([slot]) as never)
    vi.mocked(collections.queueSlots.countDocuments).mockResolvedValue(1)
    vi.mocked(collections.queueFriends.find).mockReturnValue(cursor([]) as never)
    vi.mocked(collections.queueFriends.deleteOne).mockResolvedValue({ deletedCount: 0 } as never)
    mockUpdates([slot])
  })

  it('leaves the other queue and takes the selected class slot', async () => {
    await join(queue, slotId, steamId)

    expect(vacateSlot).toHaveBeenCalledWith(steamId, emit)
    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: slot._id },
      expect.objectContaining({
        $set: expect.objectContaining({
          player: expect.objectContaining({ steamId }),
          availableClasses: [Tf2ClassName.scout],
        }),
      }),
      { returnDocument: 'after' },
    )
    expect(emit).toHaveBeenCalledWith('queue/slots:updated', expect.objectContaining({ queue }))
  })

  it('prefers the clicked class when joining with multiple available classes', async () => {
    const scoutSlot: DbSlot = { ...slot }
    const soldierSlot: DbSlot = {
      _id: new ObjectId(),
      queue,
      id: otherSlotId,
      gameClass: Tf2ClassName.soldier,
      player: null,
      ready: false,
    }
    vi.mocked(collections.queueSlots.find).mockReturnValue(
      cursor([scoutSlot, soldierSlot]) as never,
    )
    vi.mocked(collections.queueSlots.countDocuments).mockResolvedValue(0)
    mockUpdates([scoutSlot, soldierSlot])

    await join(queue, otherSlotId, steamId, [Tf2ClassName.scout, Tf2ClassName.soldier])

    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: soldierSlot._id },
      expect.objectContaining({
        $set: expect.objectContaining({
          player: expect.objectContaining({ steamId }),
          availableClasses: [Tf2ClassName.soldier, Tf2ClassName.scout],
        }),
      }),
      { returnDocument: 'after' },
    )
  })

  it('takes an occupied class slot and moves its flexible player to an alternate class', async () => {
    const scoutSlot: DbSlot = { ...slot }
    const soldierSlot: DbSlot = {
      _id: new ObjectId(),
      queue,
      id: otherSlotId,
      gameClass: Tf2ClassName.soldier,
      player: { steamId: otherSteamId, name: 'flex', avatarUrl: 'flex-avatar' },
      ready: false,
      availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier],
    }
    vi.mocked(collections.queueSlots.find).mockReturnValue(
      cursor([scoutSlot, soldierSlot]) as never,
    )
    vi.mocked(collections.queueSlots.countDocuments).mockResolvedValue(0)
    mockUpdates([scoutSlot, soldierSlot])

    // The newcomer currently prefers Scout, but clicking the occupied Soldier slot
    // explicitly requests Soldier and the flexible player is moved to Scout.
    await join(queue, otherSlotId, steamId, [Tf2ClassName.scout])

    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: soldierSlot._id },
      expect.objectContaining({ $set: { player: null, ready: false } }),
      { returnDocument: 'after' },
    )
    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: scoutSlot._id },
      expect.objectContaining({
        $set: expect.objectContaining({ player: soldierSlot.player }),
      }),
      { returnDocument: 'after' },
    )
    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: soldierSlot._id },
      expect.objectContaining({
        $set: expect.objectContaining({
          player: expect.objectContaining({ steamId }),
          availableClasses: [Tf2ClassName.soldier, Tf2ClassName.scout],
        }),
      }),
      { returnDocument: 'after' },
    )
  })

  it('does not displace an occupied player when no alternate slot is available', async () => {
    const occupiedSlot: DbSlot = {
      ...slot,
      player: { steamId: otherSteamId, name: 'specialist', avatarUrl: '' },
      availableClasses: [Tf2ClassName.scout],
    }
    vi.mocked(collections.queueSlots.find).mockReturnValue(cursor([occupiedSlot]) as never)
    vi.mocked(collections.queueSlots.countDocuments).mockResolvedValue(0)
    mockUpdates([occupiedSlot])

    await expect(join(queue, slotId, steamId)).rejects.toThrow('No valid class assignment')
    expect(collections.queueSlots.findOneAndUpdate).not.toHaveBeenCalled()
    expect(vacateSlot).not.toHaveBeenCalled()
  })

  it('keeps the player in the other queue when this one is launching', async () => {
    vi.mocked(getState).mockResolvedValue(QueueState.launching)

    await expect(join(queue, slotId, steamId)).rejects.toThrow('invalid queue state')
    expect(vacateSlot).not.toHaveBeenCalled()
  })

  it('refuses a player with a join blocker and leaves the slots alone', async () => {
    vi.mocked(joinBlocker).mockReturnValue('You have active bans')

    await expect(join(queue, slotId, steamId)).rejects.toThrow('You have active bans')
    expect(collections.queueSlots.findOneAndUpdate).not.toHaveBeenCalled()
    expect(vacateSlot).not.toHaveBeenCalled()
  })

  it("hands the player's bans and the gamemode's default skill to the join blocker", async () => {
    await join(queue, slotId, steamId)

    expect(joinBlocker).toHaveBeenCalledWith(
      expect.objectContaining({ bans: player.bans }),
      { gameClass: Tf2ClassName.scout },
      expect.anything(),
      { scout: 2, soldier: 2 },
      { skipSkillThreshold: true },
    )
  })

  it('removes a friendship when class reassignment makes it invalid', async () => {
    const scoutSlot: DbSlot = {
      ...slot,
      player: { steamId, name: 'player', avatarUrl: 'avatar' },
      availableClasses: [Tf2ClassName.scout],
    }
    const medicSlot: DbSlot = {
      _id: new ObjectId(),
      queue,
      id: 'medic-1',
      gameClass: Tf2ClassName.medic,
      player: { steamId: otherSteamId, name: 'medic', avatarUrl: 'medic-avatar' },
      ready: false,
      canMakeFriendsWith: [Tf2ClassName.scout],
    }
    const soldierSlot: DbSlot = {
      _id: new ObjectId(),
      queue,
      id: otherSlotId,
      gameClass: Tf2ClassName.soldier,
      player: null,
      ready: false,
    }
    vi.mocked(collections.queueSlots.find).mockReturnValue(
      cursor([scoutSlot, medicSlot, soldierSlot]) as never,
    )
    vi.mocked(collections.queueSlots.countDocuments).mockResolvedValue(0)
    vi.mocked(collections.queueFriends.find).mockReturnValue(
      cursor([{ queue, source: otherSteamId, target: steamId }]) as never,
    )
    mockUpdates([scoutSlot, medicSlot, soldierSlot])

    await join(queue, slotId, steamId, [Tf2ClassName.soldier])

    expect(collections.queueFriends.deleteOne).toHaveBeenCalledWith({
      queue,
      source: otherSteamId,
    })
    expect(emit).toHaveBeenCalledWith('queue/friendship:removed', {
      queue,
      source: otherSteamId,
      target: steamId,
    })
  })

  it('moves a flexible queued player to make room for a class specialist', async () => {
    const scoutSlot: DbSlot = { ...slot, player: null }
    const soldierSlot: DbSlot = {
      _id: new ObjectId(),
      queue,
      id: otherSlotId,
      gameClass: Tf2ClassName.soldier,
      player: { steamId: otherSteamId, name: 'flex', avatarUrl: 'flex-avatar' },
      ready: false,
      availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier],
    }
    vi.mocked(collections.queueSlots.find).mockReturnValue(
      cursor([scoutSlot, soldierSlot]) as never,
    )
    vi.mocked(collections.queueSlots.countDocuments).mockResolvedValue(0)
    mockUpdates([scoutSlot, soldierSlot])

    await join(queue, slotId, steamId, [Tf2ClassName.soldier])

    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: soldierSlot._id },
      expect.objectContaining({
        $set: { player: null, ready: false },
      }),
      { returnDocument: 'after' },
    )
    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: scoutSlot._id },
      expect.objectContaining({
        $set: expect.objectContaining({ player: soldierSlot.player }),
      }),
      { returnDocument: 'after' },
    )
    expect(collections.queueSlots.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: soldierSlot._id },
      expect.objectContaining({
        $set: expect.objectContaining({ player: expect.objectContaining({ steamId }) }),
      }),
      { returnDocument: 'after' },
    )
  })
})
