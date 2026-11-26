import { addMinutes } from 'date-fns'
import { z } from 'zod'
import { createHash, randomBytes } from 'node:crypto'
import { routes } from '../../../utils/routes'
import { players } from '../../../players'
import { configuration } from '../../../configuration'
import { discord } from '../../../discord'
import { DiscordSettingsEntry } from '../../../discord/views/html/discord-settings-entry'
import { encryptLinkingCode } from '../../../discord/linking-code'

export default routes(async app => {
  app
    .get('/', async (_request, reply) => reply.redirect('/settings'))
    .post(
      '/',
      { schema: { body: z.object({}).default({}) } },
      async (request, reply) => {
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
      const code = randomBytes(12).toString('hex').toUpperCase()
      const hash = createHash('sha256').update(code).digest('hex')
      const encryptedCode = await encryptLinkingCode(code)
      const expiresAt = addMinutes(new Date(), 10)

      // Keep a still-valid code. The encrypted value lets the settings page restore it
      // after a reload without storing the plaintext code in MongoDB.
      const updatedPlayer = await players.update(steamId, before => {
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

      return reply.html(
        await DiscordSettingsEntry({
          steamId,
          generatedCode:
            !updatedPlayer.discordLink && updatedPlayer.discordLinkCode?.hash === hash
              ? code
              : undefined,
          codeExpiresAt: updatedPlayer.discordLinkCode?.expiresAt,
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
