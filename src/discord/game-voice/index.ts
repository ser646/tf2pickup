import { minutesToMilliseconds } from 'date-fns'
import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js'
import { collections } from '../../database/collections'
import { SlotStatus } from '../../database/models/game-slot.model'
import { GameState, type GameModel, type GameNumber } from '../../database/models/game.model'
import { configuration } from '../../configuration'
import { games } from '../../games'
import { logger } from '../../logger'
import { Tf2Team } from '../../shared/types/tf2-team'
import { VoiceServerType } from '../../shared/types/voice-server-type'
import { tasks } from '../../tasks'
import { discord } from '../index'
import { buildPrivateVoiceChannelOverwrites } from './permission-overwrites'

interface VoiceSetup {
  guildId: string
  categoryId: string
  lobbyChannelId: string
}

interface VoiceContext extends VoiceSetup {
  guild: Guild
  category: CategoryChannel
  lobby: VoiceChannel
}

interface TeamUserIds {
  [Tf2Team.blu]: string[]
  [Tf2Team.red]: string[]
}

const activeSlotStatuses = [SlotStatus.active, SlotStatus.waitingForSubstitute]

const gameQueues = new Map<number, Promise<void>>()
const loadedGuilds = new Set<string>()

async function runForGame<T>(gameNumber: number, operation: () => Promise<T>): Promise<T> {
  const previous = gameQueues.get(gameNumber) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => {
    release = resolve
  })
  const tail = previous.then(() => current)
  gameQueues.set(gameNumber, tail)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (gameQueues.get(gameNumber) === tail) {
      gameQueues.delete(gameNumber)
    }
  }
}

async function scheduleCleanup(gameNumber: GameNumber): Promise<void> {
  await tasks.cancel('discord.cleanupGameVoice', { gameNumber })
  await tasks.schedule('discord.cleanupGameVoice', minutesToMilliseconds(1), { gameNumber })
}

async function scheduleSync(gameNumber: GameNumber): Promise<void> {
  await tasks.cancel('discord.syncGameVoice', { gameNumber })
  await tasks.schedule('discord.syncGameVoice', minutesToMilliseconds(1), { gameNumber })
}

async function selectedVoiceSetup(): Promise<VoiceSetup> {
  const type = await configuration.get('games.voice_server_type')
  if (type !== VoiceServerType.discord) {
    throw new Error('Discord is not the selected voice server')
  }

  const configurations = (await configuration.get('discord.guilds')).filter(
    ({ voiceServer }) => voiceServer !== undefined,
  )
  if (configurations.length !== 1) {
    throw new Error('Configure exactly one Discord guild with a voice category and lobby channel')
  }

  const config = configurations[0]!
  return {
    guildId: config.id,
    categoryId: config.voiceServer!.categoryId,
    lobbyChannelId: config.voiceServer!.lobbyChannelId,
  }
}

async function fetchChannelOrMissing(guild: Guild, channelId: string) {
  try {
    return await guild.channels.fetch(channelId)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 10003) {
      return null
    }
    throw error
  }
}

async function ensureLobby(
  guild: Guild,
  category: CategoryChannel,
  setup: VoiceSetup,
): Promise<VoiceChannel> {
  let lobby = await fetchChannelOrMissing(guild, setup.lobbyChannelId)

  if (lobby?.type === ChannelType.GuildVoice) {
    if (lobby.parentId !== category.id) {
      lobby = await lobby.setParent(category.id, {
        lockPermissions: false,
        reason: 'Restore the configured lobby inside TF2 MATCHES',
      })
    }
    if (lobby.name !== 'LOBBY') {
      lobby = await lobby.setName('LOBBY', 'Restore the configured match lobby name')
    }
    return lobby
  }

  lobby = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildVoice &&
      channel.parentId === category.id &&
      channel.name === 'LOBBY',
  )

  if (lobby?.type !== ChannelType.GuildVoice) {
    const botId = discord.client!.user!.id
    const lobbyPermissionBits = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.ManageChannels,
    ]
    const lobbyOverwrites: OverwriteResolvable[] = category.permissionOverwrites.cache
      .filter(overwrite => overwrite.id !== botId)
      .map(({ id, type, allow, deny }) => ({
        id,
        type,
        allow: lobbyPermissionBits.filter(permission => allow.has(permission)),
        deny: lobbyPermissionBits.filter(permission => deny.has(permission)),
      }))
      .filter(overwrite => overwrite.allow.length > 0 || overwrite.deny.length > 0)
    lobbyOverwrites.push({
      id: botId,
      type: OverwriteType.Member,
      allow: lobbyPermissionBits,
    })
    if (lobbyOverwrites.length > 100) {
      throw new Error(
        'The TF2 MATCHES category has too many permission overwrites to recreate LOBBY',
      )
    }

    lobby = await guild.channels.create({
      name: 'LOBBY',
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: lobbyOverwrites,
      reason: 'Restore the configured tf2pickup match lobby',
    })
  }

  const guildConfigs = await configuration.get('discord.guilds')
  const updatedConfigs = guildConfigs.map(config =>
    config.id === setup.guildId
      ? {
          ...config,
          voiceServer: {
            categoryId: category.id,
            lobbyChannelId: lobby.id,
          },
        }
      : config,
  )
  await configuration.set('discord.guilds', updatedConfigs, 'bot')
  await collections.games.updateMany(
    { 'discordVoiceChannels.guildId': setup.guildId },
    { $set: { 'discordVoiceChannels.lobbyChannelId': lobby.id } },
  )

  logger.warn(
    { guildId: setup.guildId, categoryId: category.id, lobbyChannelId: lobby.id },
    'recreated the missing Discord match lobby',
  )
  return lobby
}

async function context(setup: VoiceSetup): Promise<VoiceContext> {
  const client = discord.client
  if (!client?.isReady()) {
    throw new Error('Discord bot is not connected')
  }

  const guild = await client.guilds.fetch(setup.guildId)
  if (!loadedGuilds.has(guild.id)) {
    await guild.channels.fetch()
    loadedGuilds.add(guild.id)
  }

  let category = await guild.channels.fetch(setup.categoryId)
  if (category?.type !== ChannelType.GuildCategory) {
    throw new Error('Configured Discord voice category does not exist')
  }
  if (category.name !== 'TF2 MATCHES') {
    category = await category.setName(
      'TF2 MATCHES',
      'Restore the configured match voice category name',
    )
  }

  const lobby = await ensureLobby(guild, category, setup)
  const botMember = guild.members.me ?? (await guild.members.fetch(client.user.id))
  const lobbyPermissions = botMember.permissionsIn(lobby)
  if (
    !lobbyPermissions.has(PermissionFlagsBits.ViewChannel) ||
    !lobbyPermissions.has(PermissionFlagsBits.Connect) ||
    !lobbyPermissions.has(PermissionFlagsBits.MoveMembers) ||
    !lobbyPermissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    await lobby.permissionOverwrites.edit(
      botMember.id,
      {
        ViewChannel: true,
        Connect: true,
        MoveMembers: true,
        ManageChannels: true,
      },
      'Restore the bot permissions required to manage the match lobby',
    )
  }
  return { ...setup, lobbyChannelId: lobby.id, guild, category, lobby }
}

async function teamUserIds(game: GameModel): Promise<TeamUserIds> {
  const slots = game.slots.filter(({ status }) => activeSlotStatuses.includes(status))
  const linkedPlayers = await collections.players
    .find(
      {
        steamId: { $in: slots.map(({ player }) => player) },
        'discordLink.userId': { $exists: true },
      },
      { projection: { steamId: 1, 'discordLink.userId': 1 } },
    )
    .toArray()
  const usersBySteamId = new Map(
    linkedPlayers.map(player => [player.steamId, player.discordLink?.userId] as const),
  )

  return {
    [Tf2Team.blu]: [
      ...new Set(
        slots
          .filter(({ team }) => team === Tf2Team.blu)
          .map(({ player }) => usersBySteamId.get(player))
          .filter((id): id is string => !!id),
      ),
    ],
    [Tf2Team.red]: [
      ...new Set(
        slots
          .filter(({ team }) => team === Tf2Team.red)
          .map(({ player }) => usersBySteamId.get(player))
          .filter((id): id is string => !!id),
      ),
    ],
  }
}

async function usersPresentInGuild(ctx: VoiceContext, users: TeamUserIds): Promise<TeamUserIds> {
  const present = new Set<string>()
  const ids = [...new Set([...users[Tf2Team.blu], ...users[Tf2Team.red]])]

  await Promise.all(
    ids.map(async userId => {
      try {
        await ctx.guild.members.fetch(userId)
        present.add(userId)
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error.code === 10007 || error.code === 10013)
        ) {
          logger.debug(
            { guildId: ctx.guildId, userId },
            'linked Discord user is not a guild member',
          )
          return
        }
        throw error
      }
    }),
  )

  return {
    [Tf2Team.blu]: users[Tf2Team.blu].filter(id => present.has(id)),
    [Tf2Team.red]: users[Tf2Team.red].filter(id => present.has(id)),
  }
}

async function lockChannelForCleanup(
  ctx: VoiceContext,
  channel: VoiceChannel,
  gameNumber: GameNumber,
): Promise<string[]> {
  const botId = discord.client!.user!.id
  const occupants = [...ctx.guild.voiceStates.cache.values()]
    .filter(state => state.channelId === channel.id && state.id !== botId)
    .map(state => state.id)

  await channel.permissionOverwrites.set(
    permissionOverwrites(ctx, [], occupants),
    `Lock access while cleaning up game ${gameNumber}`,
  )
  return occupants
}

async function ensureBotChannelAccess(ctx: VoiceContext, channel: VoiceChannel): Promise<void> {
  const client = discord.client
  if (!client?.isReady()) {
    throw new Error('Discord bot disconnected while preparing a match voice channel')
  }
  const botMember = ctx.guild.members.me ?? (await ctx.guild.members.fetch(client.user.id))
  const permissions = botMember.permissionsIn(channel)
  if (
    !permissions.has(PermissionFlagsBits.ViewChannel) ||
    !permissions.has(PermissionFlagsBits.Connect) ||
    !permissions.has(PermissionFlagsBits.ManageChannels) ||
    !permissions.has(PermissionFlagsBits.MoveMembers)
  ) {
    await channel.permissionOverwrites.edit(
      botMember.id,
      {
        ViewChannel: true,
        Connect: true,
        ManageChannels: true,
        MoveMembers: true,
      },
      'Restore the bot permissions required to manage this match voice channel',
    )
  }
}

function permissionOverwrites(
  { guild }: VoiceContext,
  userIds: string[],
  deniedUserIds: string[] = [],
) {
  return buildPrivateVoiceChannelOverwrites(
    guild.id,
    discord.client!.user!.id,
    userIds,
    deniedUserIds,
  )
}
async function findOrCreateTeamChannel(
  ctx: VoiceContext,
  game: GameModel,
  team: Tf2Team,
  userIds: string[],
): Promise<VoiceChannel> {
  const name = `${game.number}-${team.toUpperCase()}`
  const overwrites = permissionOverwrites(ctx, userIds)
  const existing = ctx.guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildVoice &&
      channel.parentId === ctx.category.id &&
      channel.name === name,
  )

  if (existing?.type === ChannelType.GuildVoice) {
    const botId = discord.client!.user!.id
    const formerMembers = [...ctx.guild.voiceStates.cache.values()]
      .filter(
        voiceState =>
          voiceState.channelId === existing.id &&
          voiceState.id !== botId &&
          !userIds.includes(voiceState.id),
      )
      .map(voiceState => voiceState.id)
    await existing.permissionOverwrites.set(
      permissionOverwrites(ctx, userIds, formerMembers),
      `Restore private access for game ${game.number} ${team.toUpperCase()} channel`,
    )
    return existing
  }

  return ctx.guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: ctx.category.id,
    permissionOverwrites: overwrites,
    reason: `Create ${team.toUpperCase()} voice channel for game ${game.number}`,
  })
}

async function moveMemberToChannel(
  ctx: VoiceContext,
  userId: string,
  channelId: string,
): Promise<void> {
  const client = discord.client
  if (!client?.isReady()) {
    throw new Error('Discord bot disconnected before moving a match player')
  }

  let member: GuildMember
  try {
    member = await ctx.guild.members.fetch(userId)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 10007 || error.code === 10013)
    ) {
      logger.debug(
        { guildId: ctx.guildId, userId },
        'Discord member is not in the configured guild',
      )
      return
    }
    logger.warn(
      { error, guildId: ctx.guildId, userId },
      'failed to fetch Discord member for voice move',
    )
    throw error
  }

  if (member.voice.channelId === ctx.lobbyChannelId) {
    try {
      await member.voice.setChannel(channelId)
    } catch (error) {
      logger.warn(
        { error, userId, channelId },
        'failed to move Discord member to match voice channel',
      )
      throw error
    }
  }
}

async function updateSlotVoiceUrls(
  game: GameModel,
  channels: NonNullable<GameModel['discordVoiceChannels']>,
): Promise<void> {
  if (game.slots.length === 0) {
    return
  }

  await games.update(
    game.number,
    {
      $set: Object.fromEntries(
        game.slots.map((slot, index) => {
          const channelId = slot.team === Tf2Team.blu ? channels.blu : channels.red
          return [
            `slots.$[s${index}].voiceServerUrl`,
            `https://discord.com/channels/${channels.guildId}/${channelId}`,
          ]
        }),
      ),
    },
    {
      arrayFilters: game.slots.map(({ id }, index) => ({
        [`s${index}.id`]: id,
      })),
    },
  )
}

async function seatGamePlayers(ctx: VoiceContext, game: GameModel, users: TeamUserIds) {
  if (game.state !== GameState.started) {
    return
  }

  const channels = game.discordVoiceChannels
  if (!channels) {
    return
  }

  await Promise.all([
    ...users[Tf2Team.blu].map(userId => moveMemberToChannel(ctx, userId, channels.blu)),
    ...users[Tf2Team.red].map(userId => moveMemberToChannel(ctx, userId, channels.red)),
  ])
}

export async function open(game: GameModel): Promise<void> {
  try {
    await runForGame(game.number, () => openUnlocked(game))
    await tasks.cancel('discord.syncGameVoice', { gameNumber: game.number })
  } catch (error) {
    await scheduleSync(game.number)
    throw error
  }
}

async function openUnlocked(game: GameModel): Promise<void> {
  const setup = await selectedVoiceSetup()
  const ctx = await context(setup)
  const users = await usersPresentInGuild(ctx, await teamUserIds(game))

  const [blu, red] = await Promise.all([
    findOrCreateTeamChannel(ctx, game, Tf2Team.blu, users[Tf2Team.blu]),
    findOrCreateTeamChannel(ctx, game, Tf2Team.red, users[Tf2Team.red]),
  ])

  const channels = {
    guildId: ctx.guildId,
    categoryId: ctx.categoryId,
    lobbyChannelId: ctx.lobbyChannelId,
    blu: blu.id,
    red: red.id,
  }
  await games.update(game.number, { $set: { discordVoiceChannels: channels } })

  await updateSlotVoiceUrls(game, channels)

  logger.info({ gameNumber: game.number, channels }, 'Discord match voice channels created')
  await syncUnlocked(game)
}

export async function sync(game: GameModel): Promise<void> {
  try {
    await runForGame(game.number, () => syncUnlocked(game))
    await tasks.cancel('discord.syncGameVoice', { gameNumber: game.number })
  } catch (error) {
    await scheduleSync(game.number)
    throw error
  }
}

async function syncUnlocked(game: GameModel): Promise<void> {
  if ((await configuration.get('games.voice_server_type')) !== VoiceServerType.discord) {
    return
  }

  const latest = await collections.games.findOne({ number: game.number })
  if (!latest) {
    return
  }
  if (latest.state === GameState.ended || latest.state === GameState.interrupted) {
    await closeUnlocked(latest)
    return
  }
  if (!latest.discordVoiceChannels) {
    await openUnlocked(latest)
    return
  }
  const channels = latest.discordVoiceChannels

  const setup = await selectedVoiceSetup()
  if (setup.guildId !== channels.guildId) {
    logger.warn({ gameNumber: game.number }, 'Discord voice guild changed while a game was active')
    return
  }

  const ctx = await context(channels)
  const users = await usersPresentInGuild(ctx, await teamUserIds(latest))
  await updateSlotVoiceUrls(latest, channels)
  const entries = [
    { channelId: channels.blu, userIds: users[Tf2Team.blu] },
    { channelId: channels.red, userIds: users[Tf2Team.red] },
  ]
  const existingChannels = await Promise.all(
    entries.map(entry => fetchChannelOrMissing(ctx.guild, entry.channelId)),
  )
  const repairedChannels = await Promise.all(
    existingChannels.map(async channel => {
      if (channel?.type !== ChannelType.GuildVoice) {
        return null
      }

      let repaired = channel
      if (repaired.parentId !== ctx.category.id) {
        repaired = await repaired.setParent(ctx.category.id, {
          lockPermissions: false,
          reason: `Restore game ${game.number} voice channel to TF2 MATCHES`,
        })
      }
      const expectedName = `${game.number}-${index === 0 ? 'BLU' : 'RED'}`
      if (repaired.name !== expectedName) {
        repaired = await repaired.setName(
          expectedName,
          `Restore game ${game.number} team voice channel name`,
        )
      }
      return repaired
    }),
  )
  if (repairedChannels.some(channel => channel === null)) {
    await openUnlocked(latest)
    return
  }

  await Promise.all(
    repairedChannels.map(async channel => {
      if (channel?.type === ChannelType.GuildVoice) {
        await ensureBotChannelAccess(ctx, channel)
      }
    }),
  )

  // Rebuild each channel's complete overwrite list before moving anyone. This removes
  // stale role grants and temporarily denies connected former members, while preserving
  // access for the currently assigned team.
  await Promise.all(
    entries.map(async (entry, index) => {
      const channel = repairedChannels[index]
      if (channel?.type !== ChannelType.GuildVoice) {
        throw new Error(`Discord match voice channel is missing: ${entry.channelId}`)
      }
      const botId = discord.client!.user!.id
      const formerMembers = [...ctx.guild.voiceStates.cache.values()]
        .filter(
          voiceState =>
            voiceState.channelId === channel.id &&
            voiceState.id !== botId &&
            !entry.userIds.includes(voiceState.id),
        )
        .map(voiceState => voiceState.id)
      await channel.permissionOverwrites.set(
        permissionOverwrites(ctx, entry.userIds, formerMembers),
        `Temporarily lock down team access for game ${game.number}`,
      )
    }),
  )

  // Move every removed player out before removing their temporary member denies.
  // If a move fails, the denies remain in place and the scheduled retry can continue.
  for (const [index, entry] of entries.entries()) {
    const channel = repairedChannels[index]
    if (channel?.type !== ChannelType.GuildVoice) {
      throw new Error(`Discord match voice channel is missing: ${entry.channelId}`)
    }

    const voiceStates = [...ctx.guild.voiceStates.cache.values()].filter(
      state => state.channelId === channel.id,
    )
    for (const voiceState of voiceStates) {
      if (voiceState.id === discord.client!.user!.id) {
        continue
      }

      let member: GuildMember
      try {
        member = await ctx.guild.members.fetch(voiceState.id)
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error.code === 10007 || error.code === 10013)
        ) {
          continue
        }
        throw error
      }

      if (
        !member.permissions.has(PermissionFlagsBits.Administrator) &&
        !entry.userIds.includes(member.id) &&
        member.voice.channelId === channel.id
      ) {
        // The temporary overwrite set above already blocks this member from rejoining.
        await member.voice.setChannel(ctx.lobby)
      }
    }
  }

  await Promise.all(
    entries.map((entry, index) => {
      const channel = repairedChannels[index]
      if (channel?.type !== ChannelType.GuildVoice) {
        throw new Error(`Discord match voice channel is missing: ${entry.channelId}`)
      }
      return channel.permissionOverwrites.set(
        permissionOverwrites(ctx, entry.userIds),
        `Synchronize team access for game ${game.number}`,
      )
    }),
  )

  await seatGamePlayers(ctx, latest, users)
}

export async function seatFromLobby(
  guildId: string,
  userId: string,
  channelId: string | null,
): Promise<void> {
  if (!channelId) {
    return
  }

  let setup: VoiceSetup
  try {
    setup = await selectedVoiceSetup()
  } catch {
    return
  }
  if (guildId !== setup.guildId || channelId !== setup.lobbyChannelId) {
    return
  }

  const player = await collections.players.findOne(
    { 'discordLink.userId': userId },
    { projection: { steamId: 1, activeGame: 1 } },
  )
  if (!player) {
    return
  }

  let game = player.activeGame
    ? await collections.games.findOne({ number: player.activeGame })
    : null
  if (game?.state !== GameState.started) {
    game = await collections.games.findOne({
      state: GameState.started,
      'slots.player': player.steamId,
    })
  }
  if (game?.state !== GameState.started || !game.discordVoiceChannels) {
    return
  }

  try {
    await runForGame(game.number, async () => {
      const latest = await collections.games.findOne({ number: game.number })
      if (latest?.state !== GameState.started || !latest.discordVoiceChannels) {
        return
      }

      const slot = latest.slots.find(
        ({ player: steamId, status }) =>
          steamId === player.steamId && activeSlotStatuses.includes(status),
      )
      if (!slot) {
        return
      }

      const users = await teamUserIds(latest)
      if (!users[slot.team].includes(userId)) {
        return
      }

      const ctx = await context(latest.discordVoiceChannels)
      const destinationId =
        slot.team === Tf2Team.blu
          ? latest.discordVoiceChannels.blu
          : latest.discordVoiceChannels.red
      const otherTeamChannelId =
        slot.team === Tf2Team.blu
          ? latest.discordVoiceChannels.red
          : latest.discordVoiceChannels.blu
      const [destination, otherTeamChannel] = await Promise.all([
        fetchChannelOrMissing(ctx.guild, destinationId),
        fetchChannelOrMissing(ctx.guild, otherTeamChannelId),
      ])

      if (
        destination?.type !== ChannelType.GuildVoice ||
        destination.parentId !== ctx.category.id ||
        otherTeamChannel?.type !== ChannelType.GuildVoice ||
        otherTeamChannel.parentId !== ctx.category.id
      ) {
        await syncUnlocked(latest)
        return
      }

      await Promise.all([
        ensureBotChannelAccess(ctx, destination),
        ensureBotChannelAccess(ctx, otherTeamChannel),
      ])

      if (otherTeamChannel.permissionOverwrites.cache.has(userId)) {
        await otherTeamChannel.permissionOverwrites.edit(
          userId,
          { ViewChannel: false, Connect: false },
          'Remove a player from their previous team channel',
        )
      }
      await destination.permissionOverwrites.edit(
        userId,
        { ViewChannel: true, Connect: true },
        'Grant the assigned player access to their team channel',
      )
      await moveMemberToChannel(ctx, userId, destination.id)
    })
  } catch (error) {
    await scheduleSync(game.number)
    throw error
  }
}

export async function close(game: GameModel): Promise<void> {
  await tasks.cancel('discord.syncGameVoice', { gameNumber: game.number })
  await tasks.cancel('discord.cleanupGameVoice', { gameNumber: game.number })
  await runForGame(game.number, async () => {
    try {
      await closeUnlocked(game)
    } catch (error) {
      await scheduleCleanup(game.number)
      throw error
    }
  })
}

async function closeUnlocked(game: GameModel): Promise<void> {
  const latest = await collections.games.findOne({ number: game.number })
  const channels = latest?.discordVoiceChannels ?? game.discordVoiceChannels
  const client = discord.client
  if (!client?.isReady()) {
    if (client) {
      await scheduleCleanup(game.number)
    }
    return
  }

  if (!channels) {
    if ((await configuration.get('games.voice_server_type')) !== VoiceServerType.discord) {
      return
    }
    const configuredGuilds = (await configuration.get('discord.guilds')).filter(
      ({ voiceServer }) => voiceServer !== undefined,
    )
    if (configuredGuilds.length !== 1) {
      return
    }

    const config = configuredGuilds[0]!
    const setup: VoiceSetup = {
      guildId: config.id,
      categoryId: config.voiceServer!.categoryId,
      lobbyChannelId: config.voiceServer!.lobbyChannelId,
    }
    const orphanContext = await context(setup)
    const orphanNames = new Set([`${game.number}-BLU`, `${game.number}-RED`])
    const orphanChannels = [...orphanContext.guild.channels.cache.values()].filter(
      channel =>
        channel.type === ChannelType.GuildVoice &&
        channel.parentId === orphanContext.category.id &&
        orphanNames.has(channel.name),
    )
    for (const channel of orphanChannels) {
      await ensureBotChannelAccess(orphanContext, channel)
      const occupants = await lockChannelForCleanup(orphanContext, channel, game.number)
      for (const userId of occupants) {
        try {
          const member = await orphanContext.guild.members.fetch(userId)
          if (
            member.voice.channelId === channel.id &&
            !member.permissions.has(PermissionFlagsBits.Administrator)
          ) {
            await member.voice.setChannel(orphanContext.lobby)
          }
        } catch (error) {
          if (orphanContext.guild.voiceStates.cache.get(userId)?.channelId === channel.id) {
            throw error
          }
          logger.warn(
            { error, gameNumber: game.number, userId },
            'failed to return a player from an orphaned Discord channel',
          )
        }
      }
      await channel.delete(`Remove orphaned voice channel for ended game ${game.number}`)
    }
    return
  }

  const ctx = await context(channels)
  const guild = ctx.guild
  const lobbyVoiceChannel = ctx.lobby
  let allChannelsDeleted = true

  for (const channelId of [channels.blu, channels.red]) {
    const channel = await fetchChannelOrMissing(guild, channelId)
    if (!channel) {
      continue
    }
    if (channel.type !== ChannelType.GuildVoice) {
      allChannelsDeleted = false
      logger.warn(
        { gameNumber: game.number, channelId },
        'Discord match channel has an unexpected type',
      )
      continue
    }

    await ensureBotChannelAccess(ctx, channel)

    const occupants = await lockChannelForCleanup(ctx, channel, game.number)
    const failedMemberReturns = new Set<string>()
    await Promise.all(
      occupants.map(async userId => {
        try {
          const member = await guild.members.fetch(userId)
          if (
            !member.permissions.has(PermissionFlagsBits.Administrator) &&
            member.voice.channelId === channel.id
          ) {
            await member.voice.setChannel(lobbyVoiceChannel)
          }
        } catch (error) {
          if (guild.voiceStates.cache.get(userId)?.channelId === channel.id) {
            failedMemberReturns.add(userId)
          }
          logger.warn({ error, userId }, 'failed to return player to Discord lobby')
        }
      }),
    )

    if (failedMemberReturns.size > 0) {
      allChannelsDeleted = false
      continue
    }

    try {
      await channel.delete(`Game ${game.number} ended`)
    } catch (error) {
      allChannelsDeleted = false
      logger.error(
        { error, gameNumber: game.number, channelId },
        'failed to delete Discord match channel',
      )
    }
  }

  if (!allChannelsDeleted) {
    await scheduleCleanup(game.number)
    return
  }

  await games.update(game.number, { $unset: { discordVoiceChannels: 1 } })
  const discordSlots = (latest?.slots ?? []).filter(slot =>
    slot.voiceServerUrl?.startsWith(`https://discord.com/channels/${channels.guildId}/`),
  )
  if (discordSlots.length > 0) {
    await games.update(
      game.number,
      {
        $unset: Object.fromEntries(
          discordSlots.map((slot, index) => [`slots.$[s${index}].voiceServerUrl`, 1]),
        ),
      },
      {
        arrayFilters: discordSlots.map(({ id }, index) => ({
          [`s${index}.id`]: id,
        })),
      },
    )
  }
  logger.info({ gameNumber: game.number }, 'Discord match voice channels deleted')
}

export const gameVoice = { open, sync, seatFromLobby, close } as const
