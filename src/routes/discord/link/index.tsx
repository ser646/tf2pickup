import { addMinutes } from 'date-fns'
import { createHash, randomBytes } from 'node:crypto'
import { routes } from '../../../utils/routes'
import { players } from '../../../players'
import { configuration } from '../../../configuration'
import { discord } from '../../../discord'
import { DiscordSettingsEntry } from '../../../discord/views/html/discord-settings-entry'
import { encryptLinkingCode } from '../../../discord/linking-code'

export default routes(app => {
  app
    .get('/', (_request, reply) => {
      reply.redirect('/settings')
    })
    .get('/status', async (request, reply) => {
      if (!request.user) {
        reply.redirect('/auth/steam')
        return
      }
      reply.header('Cache-Control', 'no-store')

      reply.html(await DiscordSettingsEntry({ steamId: request.user.player.steamId }))
    })
    .post('/', async (request, reply) => {
      if (!request.user) {
        reply.redirect('/auth/steam')
        return
      }
      reply.header('Cache-Control', 'no-store')

      const configuredGuilds = (await configuration.get('discord.guilds')).filter(
        ({ voiceServer }) => voiceServer !== undefined,
      )
      const inviteLink = await configuration.get('misc.discord_invite_link')
      if (configuredGuilds.length !== 1 || !discord.client?.isReady() || !inviteLink) {
        reply.badRequest('Discord match voice is not configured yet. Contact an administrator.')
        return
      }

      const steamId = request.user.player.steamId
      const currentPlayer = await players.bySteamId(steamId, [
        'discordLink',
        'discordLinkCode.encryptedCode',
        'discordLinkCode.expiresAt',
      ])

      if (
        currentPlayer.discordLink ||
        (currentPlayer.discordLinkCode?.encryptedCode &&
          currentPlayer.discordLinkCode.expiresAt > new Date())
      ) {
        reply.html(await DiscordSettingsEntry({ steamId }))
        return
      }

      const code = randomBytes(12).toString('hex').toUpperCase()
      const hash = createHash('sha256').update(code).digest('hex')
      const encryptedCode = encryptLinkingCode(code)
      const expiresAt = addMinutes(new Date(), 10)

      // Re-check inside the player mutex so concurrent requests cannot replace
      // a code that another request has just generated.
      await players.update(steamId, before => {
        if (before.discordLink) {
          return { $unset: { discordLinkCode: 1 } }
        }

        if (
          before.discordLinkCode?.encryptedCode &&
          before.discordLinkCode.expiresAt > new Date()
        ) {
          return { $set: { discordLinkCode: before.discordLinkCode } }
        }

        return {
          $set: {
            discordLinkCode: {
              hash,
              encryptedCode,
              expiresAt,
            },
          },
        }
      })

      reply.html(await DiscordSettingsEntry({ steamId }))
    })
    .post('/unlink', async (request, reply) => {
      if (!request.user) {
        reply.redirect('/auth/steam')
        return
      }
      reply.header('Cache-Control', 'no-store')

      const steamId = request.user.player.steamId
      await players.update(steamId, {
        $unset: { discordLink: 1, discordLinkCode: 1 },
      })

      reply.html(await DiscordSettingsEntry({ steamId }))
    })
})
