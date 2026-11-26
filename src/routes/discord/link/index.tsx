import { addMinutes } from 'date-fns'
import { createHash, randomBytes } from 'node:crypto'
import { routes } from '../../../utils/routes'
import { players } from '../../../players'
import { configuration } from '../../../configuration'
import { discord } from '../../../discord'
import { DiscordSettingsEntry } from '../../../discord/views/html/discord-settings-entry'

export default routes(async app => {
  app
    .get('/', async (_request, reply) => reply.redirect('/settings'))
    .post('/', async (request, reply) => {
      if (!request.user) {
        return reply.redirect('/auth/steam')
      }
      reply.header('Cache-Control', 'no-store')

      const configuredGuilds = (await configuration.get('discord.guilds')).filter(
        ({ voiceServer }) => voiceServer !== undefined,
      )
      const inviteLink = await configuration.get('misc.discord_invite_link')
      if (configuredGuilds.length !== 1 || !discord.client?.isReady() || !inviteLink) {
        return reply.badRequest(
          'Discord match voice is not configured yet. Contact an administrator.',
        )
      }

      const steamId = request.user.player.steamId
      const player = await players.bySteamId(steamId, ['discordLink'])
      if (player.discordLink) {
        return reply.html(await DiscordSettingsEntry({ steamId }))
      }

      const code = randomBytes(12).toString('hex').toUpperCase()
      const hash = createHash('sha256').update(code).digest('hex')
      await players.update(steamId, before => {
        if (before.discordLink) {
          return { $unset: { discordLinkCode: 1 } }
        }

        return {
          $set: {
            discordLinkCode: {
              hash,
              expiresAt: addMinutes(new Date(), 10),
            },
          },
        }
      })

      const latestPlayer = await players.bySteamId(steamId, [
        'discordLink',
        'discordLinkCode.hash',
        'discordLinkCode.expiresAt',
      ])

      return reply.html(
        await DiscordSettingsEntry({
          steamId,
          generatedCode:
            !latestPlayer.discordLink && latestPlayer.discordLinkCode?.hash === hash
              ? code
              : undefined,
          codeExpiresAt:
            !latestPlayer.discordLink && latestPlayer.discordLinkCode?.hash === hash
              ? latestPlayer.discordLinkCode.expiresAt
              : undefined,
        }),
      )
    })
    .post('/unlink', async (request, reply) => {
      if (!request.user) {
        return reply.redirect('/auth/steam')
      }
      reply.header('Cache-Control', 'no-store')

      const steamId = request.user.player.steamId
      await players.update(steamId, {
        $unset: { discordLink: 1, discordLinkCode: 1 },
      })

      return reply.html(await DiscordSettingsEntry({ steamId }))
    })
})
