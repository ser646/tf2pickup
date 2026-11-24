import { z } from 'zod'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { VoiceServerType } from '../../../../shared/types/voice-server-type'
import { PlayerRole } from '../../../../database/models/player.model'
import { discord } from '../../../../discord'
import { configuration } from '../../../../configuration'
import { GuildConfiguration } from '../../../../admin/discord/views/html/guild-configuration'
import { routes } from '../../../../utils/routes'

// eslint-disable-next-line @typescript-eslint/require-await
export default routes(async app => {
  app
    .post(
      '/',
      {
        config: {
          authorize: [PlayerRole.admin],
        },
        schema: {
          body: z.object({
            adminNotificationsChannel: z.string().optional(),
            substituteNotificationsChannel: z.string().optional(),
            substituteNotificationsMentionRole: z.string().optional(),
            queuePromptsChannel: z.string().optional(),
            voiceServerCategoryId: z.string().optional(),
            voiceServerLobbyChannelId: z.string().optional(),
          }),
          params: z.object({
            guildId: z.string(),
          }),
        },
      },
      async (request, reply) => {
        if (!discord.client) {
          return reply.badRequest('discord integration is disabled')
        }

        const { guildId } = request.params
        const guild = discord.client.guilds.resolve(guildId)
        if (!guild) {
          return reply.notFound()
        }
        await Promise.all([guild.channels.fetch(), guild.roles.fetch()])

        const { voiceServerCategoryId, voiceServerLobbyChannelId } = request.body
        if (Boolean(voiceServerCategoryId) !== Boolean(voiceServerLobbyChannelId)) {
          return reply.badRequest('select both a voice category and a lobby channel')
        }
        if (voiceServerCategoryId && voiceServerLobbyChannelId) {
          const category = guild.channels.resolve(voiceServerCategoryId)
          const lobby = guild.channels.resolve(voiceServerLobbyChannelId)
          if (
            category?.type !== ChannelType.GuildCategory ||
            category.name !== 'TF2 MATCHES' ||
            lobby?.type !== ChannelType.GuildVoice ||
            lobby.name !== 'LOBBY' ||
            lobby.parentId !== category.id
          ) {
            return reply.badRequest(
              'select the TF2 MATCHES category and its LOBBY voice channel',
            )
          }

          const botMember = await guild.members.fetch(discord.client!.user!.id)
          if (botMember.permissions.has(PermissionFlagsBits.Administrator)) {
            return reply.badRequest(
              'Do not grant Administrator to the bot; use the explicit voice permissions listed above',
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
              'grant the bot View Channel, Connect, Manage Channels, Manage Roles, and Move Members on the server; View Channel in TF2 MATCHES; and View Channel, Connect, and Move Members in LOBBY',
            )
          }
        }

        const config = await configuration.get('discord.guilds')
        const previousVoiceServer = config.find(({ id }) => id === guildId)?.voiceServer
        const anotherVoiceServer = config.find(
          ({ id, voiceServer }) => id !== guildId && voiceServer !== undefined,
        )
        if (voiceServerCategoryId && anotherVoiceServer) {
          return reply.badRequest(
            'Only one Discord guild can be configured for match voice channels',
          )
        }
        if (
          (await configuration.get('games.voice_server_type')) === VoiceServerType.discord &&
          previousVoiceServer &&
          (previousVoiceServer.categoryId !== voiceServerCategoryId ||
            previousVoiceServer.lobbyChannelId !== voiceServerLobbyChannelId)
        ) {
          return reply.badRequest(
            'Disable the Discord voice provider before changing its category or lobby channel',
          )
        }

        const guildConfig = {
          id: guildId,
          ...(voiceServerCategoryId && voiceServerLobbyChannelId
            ? {
                voiceServer: {
                  categoryId: voiceServerCategoryId,
                  lobbyChannelId: voiceServerLobbyChannelId,
                },
              }
            : {}),
          ...(request.body.substituteNotificationsChannel
            ? {
                substituteNotifications: {
                  channel: request.body.substituteNotificationsChannel,
                  role: request.body.substituteNotificationsMentionRole ?? undefined,
                },
              }
            : {}),
          ...(request.body.queuePromptsChannel
            ? {
                queuePrompts: {
                  channel: request.body.queuePromptsChannel,
                  bumpPlayerThresholdRatio: 0.5,
                },
              }
            : {}),
          ...(request.body.adminNotificationsChannel
            ? {
                adminNotifications: {
                  channel: request.body.adminNotificationsChannel,
                },
              }
            : {}),
        }
        await configuration.set(
          'discord.guilds',
          [...config.filter(({ id }) => id !== guildId), guildConfig],
          request.user!.player.steamId,
        )
        return reply.html(GuildConfiguration({ guild, enabled: true }))
      },
    )
    .put(
      '/toggle',
      {
        config: {
          authorize: [PlayerRole.admin],
        },
        schema: {
          params: z.object({
            guildId: z.string(),
          }),
          body: z.record(z.string(), z.literal('on')),
        },
      },
      async (request, reply) => {
        if (!discord.client) {
          return reply.badRequest('discord integration is disabled')
        }

        const { guildId } = request.params
        const guild = discord.client.guilds.resolve(guildId)
        if (!guild) {
          return reply.notFound()
        }

        const enabled = guildId in request.body
        const config = await configuration.get('discord.guilds')
        const voiceServer = config.find(({ id }) => id === guildId)?.voiceServer
        if (
          !enabled &&
          voiceServer &&
          (await configuration.get('games.voice_server_type')) === VoiceServerType.discord
        ) {
          return reply.badRequest('Disable the Discord voice provider before disabling this guild')
        }
        if (enabled) {
          config.push({ id: guildId })
          await configuration.set('discord.guilds', config, request.user!.player.steamId)
        } else {
          await configuration.set(
            'discord.guilds',
            config.filter(({ id }) => id !== guildId),
            request.user!.player.steamId,
          )
        }

        return reply.html(GuildConfiguration({ guild, enabled }))
      },
    )
})
