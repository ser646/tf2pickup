import fp from 'fastify-plugin'
import { collections } from '../../database/collections'
import { GameState, type GameModel } from '../../database/models/game.model'
import { SlotStatus } from '../../database/models/game-slot.model'
import { tasks } from '../../tasks'
import { configuration } from '../../configuration'
import { events } from '../../events'
import { logger } from '../../logger'
import { safe } from '../../utils/safe'
import { VoiceServerType } from '../../shared/types/voice-server-type'
import { discord } from '../index'
import { gameVoice } from '../game-voice'

const activeGameStates: GameState[] = [
  GameState.created,
  GameState.configuring,
  GameState.launching,
  GameState.started,
]

export default fp(
  async () => {
    tasks.register('discord.cleanupGameVoice', async ({ gameNumber }) => {
      const game = await collections.games.findOne({ number: gameNumber })
      if (game && (game.state === GameState.ended || game.state === GameState.interrupted)) {
        await gameVoice.close(game)
      }
    })

    tasks.register('discord.syncGameVoice', async ({ gameNumber }) => {
      const game = await collections.games.findOne({ number: gameNumber })
      if (!game) {
        return
      }
      if (game.state === GameState.ended || game.state === GameState.interrupted) {
        await gameVoice.close(game)
      } else if (
        [GameState.created, GameState.configuring, GameState.launching, GameState.started].includes(
          game.state,
        ) &&
        (await configuration.get('games.voice_server_type')) === VoiceServerType.discord
      ) {
        if (game.discordVoiceChannels) {
          await gameVoice.sync(game)
        } else {
          await gameVoice.open(game)
        }
      }
    })

    const client = discord.client
    if (!client) {
      return
    }

    client.on('voiceStateUpdate', (before, after) => {
      if (before.channelId === after.channelId || !after.channelId) {
        return
      }

      void gameVoice
        .seatFromLobby(after.guild.id, after.id, after.channelId)
        .catch((error: unknown) => {
          logger.warn({ error, userId: after.id }, 'failed to route Discord lobby member')
        })
    })

    events.on(
      'game:created',
      safe(async ({ game }) => {
        if ((await configuration.get('games.voice_server_type')) === VoiceServerType.discord) {
          await gameVoice.open(game)
        }
      }),
    )

    events.on(
      'game:updated',
      safe(async ({ before, after }) => {
        if (
          (await configuration.get('games.voice_server_type')) === VoiceServerType.discord &&
          (before.state !== after.state || voiceRosterKey(before) !== voiceRosterKey(after))
        ) {
          await gameVoice.sync(after)
        }
      }),
    )

    events.on(
      'game:playerReplaced',
      safe(async ({ game }) => {
        if ((await configuration.get('games.voice_server_type')) === VoiceServerType.discord) {
          await gameVoice.sync(game)
        }
      }),
    )

    events.on(
      'player:updated',
      safe(async ({ before, after }) => {
        if (before.discordLink?.userId === after.discordLink?.userId) {
          return
        }

        let game = after.activeGame
          ? await collections.games.findOne({ number: after.activeGame })
          : null
        if (!game || !activeGameStates.includes(game.state)) {
          game = await collections.games.findOne({
            state: { $in: activeGameStates },
            slots: {
              $elemMatch: {
                player: after.steamId,
                status: { $in: [SlotStatus.active, SlotStatus.waitingForSubstitute] },
              },
            },
          })
        }
        if (game && activeGameStates.includes(game.state)) {
          await gameVoice.sync(game)
        }
      }),
    )

    events.on(
      'game:ended',
      safe(async ({ game }) => {
        await gameVoice.close(game)
      }),
    )

    if ((await configuration.get('games.voice_server_type')) === VoiceServerType.discord) {
      const activeGames = await collections.games
        .find({ state: { $in: activeGameStates } })
        .toArray()

      for (const game of activeGames) {
        try {
          if (game.discordVoiceChannels) {
            await gameVoice.sync(game)
          } else {
            await gameVoice.open(game)
          }
        } catch (error) {
          logger.error(
            { error, gameNumber: game.number },
            'failed to restore Discord game voice channels',
          )
        }
      }
    }

    const endedGames = await collections.games
      .find({
        state: { $in: [GameState.ended, GameState.interrupted] },
        discordVoiceChannels: { $exists: true },
      })
      .toArray()

    for (const game of endedGames) {
      try {
        await gameVoice.close(game)
      } catch (error) {
        logger.error(
          { error, gameNumber: game.number },
          'failed to clean up ended Discord game voice channels',
        )
      }
    }
  },
  { name: 'discord game voice' },
)

function voiceRosterKey(game: GameModel): string {
  return game.slots
    .map(({ id, player, team, status }) => `${id}:${player}:${team}:${status}`)
    .join('|')
}
