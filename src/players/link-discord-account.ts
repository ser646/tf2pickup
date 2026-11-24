import type { SteamId64 } from '../shared/types/steam-id-64'
import { collections } from '../database/collections'
import { events } from '../events'

const historyProjection = { eloHistory: 0, skillHistory: 0, nameHistory: 0 } as const

export async function linkDiscordAccount(
  steamId: SteamId64,
  codeHash: string,
  discordUserId: string,
): Promise<boolean> {
  const now = new Date()
  const before = await collections.players.findOne(
    { steamId },
    { projection: historyProjection },
  )
  if (!before) {
    return false
  }

  const after = await collections.players.findOneAndUpdate(
    {
      steamId,
      discordLink: { $exists: false },
      'discordLinkCode.hash': codeHash,
      'discordLinkCode.expiresAt': { $gt: now },
    },
    {
      $set: {
        discordLink: {
          userId: discordUserId,
          linkedAt: now,
        },
      },
      $unset: { discordLinkCode: 1 },
    },
    {
      returnDocument: 'after',
      projection: historyProjection,
    },
  )

  if (!after) {
    return false
  }

  events.emit('player:updated', { before, after })
  return true
}
