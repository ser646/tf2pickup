import { PlayerRole } from '../../../database/models/player.model'
import { z } from 'zod'
import { requestContext } from '@fastify/request-context'
import { DiscordPage } from '../../../admin/discord/views/html/discord.page'
import { routes } from '../../../utils/routes'
import { configuration } from '../../../configuration'

const emptyString = z
  .union([z.literal('').transform(() => null), z.url()])
  .nullable()
  .default(null)

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
        await reply.status(200).html(DiscordPage())
      },
    )
    .post(
      '/invite-link',
      {
        config: {
          authorize: [PlayerRole.admin],
        },
        schema: {
          body: z.object({
            discordInviteLink: emptyString,
          }),
        },
      },
      async (request, reply) => {
        await configuration.set(
          'misc.discord_invite_link',
          request.body.discordInviteLink,
          request.user!.player.steamId,
        )
        requestContext.set('messages', { success: ['Configuration saved'] })
        await reply.status(200).html(DiscordPage())
      },
    )
})
