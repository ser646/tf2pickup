import { OverwriteType, PermissionFlagsBits, type OverwriteResolvable } from 'discord.js'

const channelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ManageChannels,
]

const playerPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
]

/**
 * Build a complete permission-overwrite set for a private match voice channel.
 * Only the bot and explicitly assigned players receive member-level grants.
 * Former occupants can be temporarily denied while they are moved back to LOBBY.
 */
export function buildPrivateVoiceChannelOverwrites(
  guildId: string,
  botUserId: string,
  allowedUserIds: readonly string[],
  temporarilyDeniedUserIds: readonly string[] = [],
): OverwriteResolvable[] {
  const allowedUsers = new Set(allowedUserIds)
  const deniedUsers = new Set(temporarilyDeniedUserIds)

  const overwrites: OverwriteResolvable[] = [
    {
      id: guildId,
      type: OverwriteType.Role,
      deny: channelPermissions,
    },
    {
      id: botUserId,
      type: OverwriteType.Member,
      allow: channelPermissions,
    },
    ...[...allowedUsers]
      .filter(userId => userId !== botUserId)
      .map(
        (userId): OverwriteResolvable => ({
          id: userId,
          type: OverwriteType.Member,
          allow: playerPermissions,
        }),
      ),
    ...[...deniedUsers]
      .filter(userId => userId !== botUserId && !allowedUsers.has(userId))
      .map(
        (userId): OverwriteResolvable => ({
          id: userId,
          type: OverwriteType.Member,
          deny: playerPermissions,
        }),
      ),
  ]

  if (overwrites.length > 100) {
    throw new Error(
      'Too many linked players or stale member permissions to create private match voice channels (Discord allows at most 100 permission overwrites per channel)',
    )
  }

  return overwrites
}
