import { collections } from '../../database/collections'
import { GameState, type GameModel } from '../../database/models/game.model'
import { SlotStatus } from '../../database/models/game-slot.model'
import { logger } from '../../logger'
import { Tf2ClassName } from '../../shared/types/tf2-class-name'
import { VoiceServerType } from '../../shared/types/voice-server-type'
import { configuration } from '../../configuration'
import { discord } from '../index'

const classEmojis: Record<Tf2ClassName, string> = {
  [Tf2ClassName.scout]: '🏃',
  [Tf2ClassName.soldier]: '🚀',
  [Tf2ClassName.pyro]: '🔥',
  [Tf2ClassName.demoman]: '💣',
  [Tf2ClassName.heavy]: '💪',
  [Tf2ClassName.engineer]: '🔧',
  [Tf2ClassName.medic]: '💉',
  [Tf2ClassName.sniper]: '🎯',
  [Tf2ClassName.spy]: '🕵️',
}

const activeSlotStatuses = [SlotStatus.active, SlotStatus.waitingForSubstitute]

type NicknameState = {
  guildId: string
  userId: string
  gameNumber: number
  originalNickname: string | null
  appliedNickname: string
}

function nicknameFor(name: string, gameClass: Tf2ClassName): string {
  let nickname = ''
  for (const character of Array.from(`${classEmojis[gameClass]} ${name}`)) {
    if (nickname.length + character.length > 32) {
      break
    }
    nickname += character
  }
  return nickname
}

async function restoreNickname(player: {
  steamId: string
  discordNickname?: NicknameState
}): Promise<void> {
  const state = player.discordNickname
  if (!state) {
    return
  }

  const client = discord.client
  if (!client?.isReady()) {
    return
  }

  try {
    const guild = await client.guilds.fetch(state.guildId)
    const member = await guild.members.fetch(state.userId)
    if (member.nickname === state.appliedNickname) {
      if (!member.manageable) {
        logger.warn(
          { steamId: player.steamId, userId: state.userId, guildId: state.guildId },
          'cannot restore Discord nickname yet because the bot role is too low',
        )
        return
      }
      await member.setNickname(
        state.originalNickname,
        'Restore Discord nickname after tf2pickup match',
      )
    }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 10007 || error.code === 10013)
    ) {
      logger.debug(
        { steamId: player.steamId, userId: state.userId },
        'cannot restore nickname because the Discord member is no longer in the guild',
      )
    } else {
      throw error
    }
  }

  await collections.players.updateOne(
    { steamId: player.steamId },
    { $unset: { discordNickname: 1 } },
  )
}

async function applyNickname(
  player: {
    steamId: string
    name: string
    discordLink?: { userId: string }
    discordNickname?: NicknameState
  },
  game: GameModel,
  gameClass: Tf2ClassName,
  guildId: string,
): Promise<void> {
  const client = discord.client
  if (!client?.isReady() || !player.discordLink) {
    return
  }

  const userId = player.discordLink.userId
  let guild
  let member
  try {
    guild = await client.guilds.fetch(guildId)
    member = await guild.members.fetch(userId)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 10007 || error.code === 10013)
    ) {
      logger.debug(
        { steamId: player.steamId, userId, guildId },
        'linked Discord member is not in the configured guild',
      )
      return
    }
    throw error
  }

  let state = player.discordNickname
  if (state && (state.guildId !== guildId || state.userId !== userId)) {
    await restoreNickname(player)
    state = undefined
  }

  const nickname = nicknameFor(player.name, gameClass)
  if (!state) {
    state = {
      guildId,
      userId,
      gameNumber: game.number,
      originalNickname: member.nickname,
      appliedNickname: nickname,
    }
    await collections.players.updateOne(
      { steamId: player.steamId },
      { $set: { discordNickname: state } },
    )
  } else {
    state = { ...state, gameNumber: game.number, appliedNickname: nickname }
    await collections.players.updateOne(
      { steamId: player.steamId },
      { $set: { discordNickname: state } },
    )
  }

  if (!member.manageable) {
    logger.warn(
      { steamId: player.steamId, userId, guildId },
      'bot cannot manage this Discord member nickname; check role hierarchy and Manage Nicknames permission',
    )
    return
  }

  if (member.nickname !== nickname) {
    await member.setNickname(nickname, `Synchronize tf2pickup class for game ${game.number}`)
  }
}

export async function syncGameNicknames(game: GameModel): Promise<void> {
  const isFinished = game.state === GameState.ended || game.state === GameState.interrupted
  if (
    !isFinished &&
    (await configuration.get('games.voice_server_type')) !== VoiceServerType.discord
  ) {
    return
  }

  if (isFinished) {
    const savedPlayers = await collections.players
      .find({ 'discordNickname.gameNumber': game.number })
      .toArray()
    if (savedPlayers.length > 0 && !game.discordVoiceChannels) {
      for (const player of savedPlayers) {
        await restoreNickname(player)
      }
      return
    }
  }

  const guildId =
    game.discordVoiceChannels?.guildId ??
    (await configuration.get('discord.guilds')).find(({ voiceServer }) => voiceServer)?.id
  if (!guildId) {
    return
  }

  const activeSlots = isFinished
    ? []
    : game.slots.filter(({ status }) => activeSlotStatuses.includes(status))
  const slotsBySteamId = new Map(activeSlots.map(slot => [slot.player, slot.gameClass]))

  const [playersInGame, previouslySynced] = await Promise.all([
    slotsBySteamId.size > 0
      ? collections.players
          .find({ steamId: { $in: [...slotsBySteamId.keys()] } })
          .toArray()
      : Promise.resolve([]),
    collections.players
      .find({ 'discordNickname.guildId': guildId, 'discordNickname.gameNumber': game.number })
      .toArray(),
  ])

  const currentSteamIds = new Set(slotsBySteamId.keys())
  for (const player of previouslySynced) {
    if (!currentSteamIds.has(player.steamId)) {
      await restoreNickname(player)
    }
  }

  for (const player of playersInGame) {
    const gameClass = slotsBySteamId.get(player.steamId)
    if (!gameClass || !player.discordLink) {
      if (player.discordNickname?.gameNumber === game.number) {
        await restoreNickname(player)
      }
      continue
    }

    await applyNickname(player, game, gameClass, guildId)
  }
}

export async function restoreStaleNicknames(): Promise<void> {
  const savedPlayers = await collections.players
    .find({ discordNickname: { $exists: true } })
    .toArray()
  if (savedPlayers.length === 0) {
    return
  }

  const activeGames = await collections.games
    .find({
      number: { $in: savedPlayers.map(player => player.discordNickname!.gameNumber) },
      state: {
        $in: [
          GameState.created,
          GameState.configuring,
          GameState.launching,
          GameState.started,
        ],
      },
    })
    .toArray()
  const activeGameNumbers = new Set(activeGames.map(({ number }) => number))

  for (const player of savedPlayers) {
    if (!activeGameNumbers.has(player.discordNickname!.gameNumber)) {
      await restoreNickname(player)
    }
  }
}
