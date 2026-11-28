import z from 'zod'
import { PlayerGameList, PlayerPage } from '../../../players/views/html/player.page'
import { steamId64 } from '../../../shared/schemas/steam-id-64'
import { players } from '../../../players'
import { routes } from '../../../utils/routes'
import { tasks } from '../../../tasks'
import { shouldSyncEtf2lProfile } from '../../../etf2l/should-sync-etf2l-profile'
import { collections } from '../../../database/collections'
import { Gamemode } from '../../../shared/types/gamemode'
import { Tf2ClassName } from '../../../shared/types/tf2-class-name'
import { queuePage } from '../../../queues/page'
import { SkillOnboardingDialog } from '../../../players/views/html/skill-onboarding-dialog'

// eslint-disable-next-line @typescript-eslint/require-await
export default routes(async app => {
  app
    .get(
      '/',
      {
        schema: {
          params: z.object({
            steamId: steamId64,
          }),
          querystring: z.object({
            gamespage: z.coerce.number().optional(),
            gamemode: z.enum(Gamemode).optional(),
            gameClass: z.enum(Tf2ClassName).optional(),
          }),
        },
      },
      async (req, reply) => {
        const { steamId } = req.params
        const page = Number(req.query.gamespage) || 1
        const { gamemode, gameClass } = req.query

        const player = await players.bySteamId(steamId, [
          'steamId',
          'name',
          'joinedAt',
          'roles',
          'etf2lProfile',
          'twitchTvProfile',
          'avatar.large',
          'stats',
          'skill',
          'skillHistory',
          'verified',
          'bans',
          'chatMutes',
          'elo',
          'etf2lProfileLastSyncedAt',
        ])

        if (shouldSyncEtf2lProfile(player)) {
          await tasks.schedule('etf2l:syncPlayerProfile', 0, { player: steamId })
        }

        await reply.html(
          req.isPartialFor('gameList') ? (
            <PlayerGameList
              steamId={steamId}
              page={page}
              gamemode={gamemode}
              gameClass={gameClass}
            />
          ) : (
            <PlayerPage player={player} page={page} gamemode={gamemode} gameClass={gameClass} />
          ),
        )
      },
    )
    .post(
      '/accept-rules',
      {
        schema: {
          params: z.object({
            steamId: steamId64,
          }),
          querystring: z.object({ gamemode: z.enum(Gamemode).optional() }),
        },
      },
      async (request, reply) => {
        await collections.players.updateOne(
          { steamId: request.params.steamId },
          { $set: { hasAcceptedRules: true } },
        )
        if (request.isHtmx()) {
          await queuePage.updateAll(
            app.gateway,
            { slots: 'all', captainPool: true },
            { players: [request.params.steamId] },
          )
          if (request.query.gamemode === Gamemode.sixes) {
            await reply.html(SkillOnboardingDialog({ actor: request.user }))
            return
          }
          await reply.send('')
          return
        }
        await reply.redirect('/')
      },
    )
})
