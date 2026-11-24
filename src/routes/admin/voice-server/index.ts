import { PlayerRole } from '../../../database/models/player.model'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { GameState } from '../../../database/models/game.model'
import { collections } from '../../../database/collections'
import { z } from 'zod'
import { VoiceServerType } from '../../../shared/types/voice-server-type'
import { configuration } from '../../../configuration'
import { requestContext } from '@fastify/request-context'
import { VoiceServerPage } from '../../../admin/voice-server/views/html/voice-server.page'
import { routes } from '../../../utils/routes'
import { discord } from '../../../discord'

const emptyString = z
  .union([z.literal('').transform(() => null), z.string()])
  .nullable()
  .default(null)

const mumbleUsernameDefault = configuration.getDefault('games.voice_server.mumble.username')

// eslint-disable-next-line @typescript-eslint/require-await
export default routes(async app => {
  app
    .get(
      '/',
      {
        config: {
          authorize: [PlayerRole.admin],
        },
      },
      async (_request, reply) => {
        await reply.status(200).html(VoiceServerPage())
      },
    )
    .post(
      '/',
      {
        config: {
          authorize: [PlayerRole.admin],
        },
        schema: {
          body: z.object({
            type: z.enum(VoiceServerType),
            staticLink: z.url().nullable().default(null),
            mumbleUrl: emptyString,
            mumbleInternalUrl: emptyString,
            mumblePort: z.coerce.number().gte(0).lte(65535).optional().default(64738),
            mumblePassword: emptyString,
            mumbleChannelName: emptyString,
            mumbleUsername: z
              .union([z.literal('').transform(() => mumbleUsernameDefault), z.string()])
              .default(mumbleUsernameDefault),
            mumblePlayerVerification: z.coerce.boolean().default(false),
          }),
        },
      },
      async (request, reply) => {
        const {
          type,
          staticLink,
          mumbleUrl,
          mumbleInternalUrl,
          mumblePort,
          mumblePassword,
          mumbleChannelName,
          mumbleUsername,
          mumblePlayerVerification,
        } = request.body
        const actor = request.user!.player.steamId
        const discordClient = discord.client
        const currentType = await configuration.get('games.voice_server_type')
        if (type === VoiceServerType.discord && currentType !== VoiceServerType.discord) {
          const activeGames = await collections.games.countDocuments({
            state: {
              $in: [
                GameState.created,
                GameState.configuring,
                GameState.launching,
                GameState.started,
              ],
            },
          })
          if (activeGames > 0) {
            return reply.badRequest(
              'Finish all active games before switching to Discord voice channels',
            )
          }
        }
        if (currentType === VoiceServerType.discord && type !== VoiceServerType.discord) {
          const gamesUsingDiscord = await collections.games.countDocuments({
            $or: [
              {
                state: {
                  $in: [
                    GameState.created,
                    GameState.configuring,
                    GameState.launching,
                    GameState.started,
                  ],
                },
              },
              { discordVoiceChannels: { $exists: true } },
            ],
          })
          if (gamesUsingDiscord > 0) {
            return reply.badRequest(
              'Finish all active games and clean up all Discord match channels before disabling or changing the Discord voice provider',
            )
          }
        }
        if (type === VoiceServerType.discord) {
          if (!discordClient?.isReady()) {
            return reply.badRequest('The Discord bot is not connected')
          }
          const voiceGuilds = (await configuration.get('discord.guilds')).filter(
            ({ voiceServer }) => voiceServer !== undefined,
          )
          if (voiceGuilds.length !== 1) {
            return reply.badRequest(
              'Configure exactly one Discord guild with a voice category and lobby in Admin > Discord first',
            )
          }

          const voiceServer = voiceGuilds[0]!.voiceServer!
          const guild = await discordClient.guilds.fetch(voiceGuilds[0]!.id)
          await Promise.all([guild.channels.fetch(), guild.roles.fetch()])
          const category = await guild.channels.fetch(voiceServer.categoryId)
          const lobby = await guild.channels.fetch(voiceServer.lobbyChannelId)
          if (
            category?.type !== ChannelType.GuildCategory ||
            category.name !== 'TF2 MATCHES' ||
            lobby?.type !== ChannelType.GuildVoice ||
            lobby.name !== 'LOBBY' ||
            lobby.parentId !== category.id
          ) {
            return reply.badRequest(
              'The configured TF2 MATCHES category or its LOBBY voice channel is missing or has been renamed',
            )
          }

          const botMember = await guild.members.fetch(discordClient.user!.id)
          if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
            return reply.badRequest(
              'Remove Administrator from the bot and grant only the explicit Discord voice permissions',
            )
          }
          const categoryPermissions = botMember.permissionsIn(category)
          const lobbyPermissions = botMember.permissionsIn(lobby)
          if (
            !botMember.permissions.has(PermissionFlagsBits.ViewChannel) ||
            !botMember.permissions.has(PermissionFlagsBits.Connect) ||
            !botMember.permissions.has(PermissionFlagsBits.ManageChannels) ||
            !botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
            !botMember.permissions.has(PermissionFlagsBits.MoveMembers) ||
            !categoryPermissions.has(PermissionFlagsBits.ViewChannel) ||
            !lobbyPermissions.has(PermissionFlagsBits.ViewChannel) ||
            !lobbyPermissions.has(PermissionFlagsBits.Connect) ||
            !lobbyPermissions.has(PermissionFlagsBits.MoveMembers)
          ) {
            return reply.badRequest(
              'The bot no longer has all required Discord voice permissions. Check Admin > Discord settings',
            )
          }
        }
        await configuration.set('games.voice_server_type', type, actor)
        if (type === VoiceServerType.staticLink) {
          await configuration.set('games.voice_server.static_link', staticLink, actor)
        } else if (type === VoiceServerType.mumble) {
          await Promise.all([
            configuration.set('games.voice_server.mumble.url', mumbleUrl, actor),
            configuration.set('games.voice_server.mumble.internal_url', mumbleInternalUrl, actor),
            configuration.set('games.voice_server.mumble.port', mumblePort, actor),
            configuration.set('games.voice_server.mumble.password', mumblePassword, actor),
            configuration.set('games.voice_server.mumble.channel_name', mumbleChannelName, actor),
            configuration.set('games.voice_server.mumble.username', mumbleUsername, actor),
            configuration.set(
              'games.voice_server.mumble.player_verification',
              mumblePlayerVerification,
              actor,
            ),
          ])
        }
        requestContext.set('messages', { success: ['Configuration saved'] })
        await reply.status(200).html(VoiceServerPage())
      },
    )
})
