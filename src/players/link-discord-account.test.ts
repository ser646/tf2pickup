import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SteamId64 } from '../shared/types/steam-id-64'
import type { PlayerModel } from '../database/models/player.model'

vi.mock('../database/collections', () => ({
  collections: {
    players: {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
  },
}))

vi.mock('../events', () => ({
  events: { emit: vi.fn() },
}))

import { collections } from '../database/collections'
import { events } from '../events'
import { linkDiscordAccount } from './link-discord-account'

const steamId = '76561198000000001' as SteamId64
const discordUserId = '123456789012345678'
const codeHash = 'a'.repeat(64)
const before = { steamId, name: 'Player' } as PlayerModel
const after = {
  ...before,
  discordLink: { userId: discordUserId, linkedAt: new Date() },
} as PlayerModel

describe('linkDiscordAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(collections.players.findOne).mockResolvedValue(before)
    vi.mocked(collections.players.findOneAndUpdate).mockResolvedValue(after)
  })

  it('atomically consumes a valid, unused code and links the Discord user', async () => {
    await expect(linkDiscordAccount(steamId, codeHash, discordUserId)).resolves.toBe(true)

    expect(collections.players.findOneAndUpdate).toHaveBeenCalledWith(
      {
        steamId,
        discordLink: { $exists: false },
        'discordLinkCode.hash': codeHash,
        'discordLinkCode.expiresAt': { $gt: expect.any(Date) },
      },
      {
        $set: {
          discordLink: {
            userId: discordUserId,
            linkedAt: expect.any(Date),
          },
        },
        $unset: { discordLinkCode: 1 },
      },
      expect.objectContaining({ returnDocument: 'after' }),
    )
    expect(events.emit).toHaveBeenCalledWith('player:updated', { before, after })
  })

  it('returns false when the Steam player does not exist', async () => {
    vi.mocked(collections.players.findOne).mockResolvedValue(null)

    await expect(linkDiscordAccount(steamId, codeHash, discordUserId)).resolves.toBe(false)
    expect(collections.players.findOneAndUpdate).not.toHaveBeenCalled()
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('returns false when the code was already consumed or expired', async () => {
    vi.mocked(collections.players.findOneAndUpdate).mockResolvedValue(null)

    await expect(linkDiscordAccount(steamId, codeHash, discordUserId)).resolves.toBe(false)
    expect(events.emit).not.toHaveBeenCalled()
  })
})
