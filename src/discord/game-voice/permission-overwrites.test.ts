import { describe, expect, it } from 'vitest'
import { OverwriteType, PermissionFlagsBits } from 'discord.js'
import { buildPrivateVoiceChannelOverwrites } from './permission-overwrites'

const guildId = 'guild'
const botUserId = 'bot'

function overwriteFor(
  overwrites: ReturnType<typeof buildPrivateVoiceChannelOverwrites>,
  id: string,
) {
  return overwrites.find(overwrite => overwrite.id === id)
}

describe('buildPrivateVoiceChannelOverwrites', () => {
  it('denies the default role and grants the bot the permissions it needs', () => {
    const overwrites = buildPrivateVoiceChannelOverwrites(guildId, botUserId, [])
    const everyone = overwriteFor(overwrites, guildId)
    const bot = overwriteFor(overwrites, botUserId)

    expect(everyone).toMatchObject({ type: OverwriteType.Role })
    expect(everyone?.deny).toEqual([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.ManageChannels,
    ])
    expect(bot).toMatchObject({ type: OverwriteType.Member })
    expect(bot?.allow).toEqual([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.ManageChannels,
    ])
  })

  it('grants assigned players only view and connect permissions', () => {
    const overwrites = buildPrivateVoiceChannelOverwrites(
      guildId,
      botUserId,
      ['blu-player', 'red-player'],
    )

    expect(overwriteFor(overwrites, 'blu-player')).toMatchObject({
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    })
    expect(overwriteFor(overwrites, 'red-player')?.allow).toEqual([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
    ])
  })

  it('temporarily denies former occupants without overriding current team members', () => {
    const overwrites = buildPrivateVoiceChannelOverwrites(
      guildId,
      botUserId,
      ['current-player'],
      ['former-player', 'current-player', botUserId],
    )

    expect(overwriteFor(overwrites, 'former-player')?.deny).toEqual([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
    ])
    expect(overwriteFor(overwrites, 'current-player')?.allow).toEqual([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
    ])
    expect(overwriteFor(overwrites, botUserId)?.deny).toBeUndefined()
    expect(overwrites.filter(overwrite => overwrite.id === 'current-player')).toHaveLength(1)
    expect(overwrites.filter(overwrite => overwrite.id === botUserId)).toHaveLength(1)
  })

  it('deduplicates users and excludes the bot from player-level grants', () => {
    const overwrites = buildPrivateVoiceChannelOverwrites(
      guildId,
      botUserId,
      ['player', 'player', botUserId],
    )

    expect(overwrites.filter(overwrite => overwrite.id === 'player')).toHaveLength(1)
    expect(overwrites.filter(overwrite => overwrite.id === botUserId)).toHaveLength(1)
  })

  it('allows at most 100 overwrites per channel', () => {
    const maximumAllowedUsers = Array.from({ length: 98 }, (_, index) => `player-${index}`)
    expect(
      buildPrivateVoiceChannelOverwrites(guildId, botUserId, maximumAllowedUsers),
    ).toHaveLength(100)

    const tooManyUsers = [...maximumAllowedUsers, 'player-over-limit']
    expect(() =>
      buildPrivateVoiceChannelOverwrites(guildId, botUserId, tooManyUsers),
    ).toThrow(/at most 100 permission overwrites/)
  })
})
