import { z } from 'zod'
import { Etf2lApiError } from '../../../../etf2l/errors/etf2l-api.error'
import { etf2l } from '../../../../etf2l'
import { errors } from '../../../../errors'
import { gamemodeConfigs } from '../../../../gamemodes/configs'
import { players } from '../../../../players'
import type { PlayerSkill } from '../../../../database/models/player.model'
import { Gamemode } from '../../../../shared/types/gamemode'
import { steamId64 } from '../../../../shared/schemas/steam-id-64'
import { routes } from '../../../../utils/routes'

const paramsSchema = z.object({ steamId: steamId64 })

export default routes(async app => {
  app.post(
    '/',
    {
      config: { authenticate: true },
      schema: {
        params: paramsSchema,
        body: z.object({
          skillLevel: z.coerce.number().int().min(1).max(5),
        }),
      },
    },
    async (request, reply) => {
      const steamId = request.user!.player.steamId
      if (request.params.steamId !== steamId) {
        throw errors.forbidden('You can only update your own skill')
      }

      const player = await players.bySteamId(steamId, [
        'skill',
        'skillOnboardingCompletedAt',
        'etf2lSkillVerification',
      ])
      if (player.skillOnboardingCompletedAt || player.skill?.[Gamemode.sixes]) {
        throw errors.badRequest('Your 6v6 skill has already been set')
      }

      const maxLevel = player.etf2lSkillVerification?.maxLevel ?? 3
      if (request.body.skillLevel > maxLevel) {
        throw errors.forbidden('Verify your ETF2L history before selecting level 4 or 5')
      }

      const skill = Object.fromEntries(
        gamemodeConfigs[Gamemode.sixes].classes.map(({ name }) => [name, request.body.skillLevel]),
      ) as PlayerSkill
      await players.setSkill({
        steamId,
        gamemode: Gamemode.sixes,
        skill,
        actor: steamId,
      })
      await players.update(
        steamId,
        { $set: { skillOnboardingCompletedAt: new Date() } },
        {},
        steamId,
      )
      request.flash('success', 'Your 6v6 skill has been saved')
      await reply.redirect('/')
    },
  )

  app.post(
    '/verify',
    {
      config: { authenticate: true },
      schema: { params: paramsSchema },
    },
    async (request, reply) => {
      const steamId = request.user!.player.steamId
      if (request.params.steamId !== steamId) {
        throw errors.forbidden('You can only verify your own ETF2L history')
      }

      const player = await players.bySteamId(steamId, ['etf2lProfile'])
      let profile = player.etf2lProfile

      if (!profile) {
        try {
          const fetched = await etf2l.getPlayerProfile(steamId)
          profile = { id: fetched.id, name: fetched.name, country: fetched.country }
          await players.update(
            steamId,
            { $set: { etf2lProfile: profile, etf2lProfileLastSyncedAt: new Date() } },
            {},
            steamId,
          )
        } catch (error) {
          if (error instanceof Etf2lApiError && error.response.status === 404) {
            throw errors.badRequest('No ETF2L profile is linked to this Steam account')
          }
          throw errors.serviceUnavailable('ETF2L is unavailable. Please try again later.')
        }
      }

      try {
        const eligibility = await etf2l.getPlayerSkillEligibility(profile.id)
        await players.update(
          steamId,
          {
            $set: {
              etf2lSkillVerification: {
                ...eligibility,
                checkedAt: new Date(),
              },
            },
          },
          {},
          steamId,
        )
      } catch {
        throw errors.serviceUnavailable('ETF2L is unavailable. Please try again later.')
      }

      request.flash('success', 'ETF2L history checked')
      await reply.redirect('/')
    },
  )
})
