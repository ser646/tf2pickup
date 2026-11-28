import { z } from 'zod'
import { PlayerRole } from '../../../database/models/player.model'
import { MiscellaneousPage } from '../../../admin/miscellaneous/views/html/miscellaneous.page'
import { configuration } from '../../../configuration'
import { routes } from '../../../utils/routes'

const config = { authorize: [PlayerRole.admin] }

// eslint-disable-next-line @typescript-eslint/require-await
export default routes(async app => {
  app
    .get('/', { config }, async (_request, reply) => {
      await reply.status(200).html(MiscellaneousPage())
    })
    .post(
      '/',
      {
        config,
        schema: {
          body: z.object({
            skillOnboardingEnabled: z.literal('true').optional(),
          }),
        },
      },
      async (request, reply) => {
        await configuration.set(
          'players.skill_onboarding_enabled',
          request.body.skillOnboardingEnabled === 'true',
          request.user!.player.steamId,
        )
        request.flash('success', 'Configuration saved')
        await reply.redirect('/admin/miscellaneous')
      },
    )
})
