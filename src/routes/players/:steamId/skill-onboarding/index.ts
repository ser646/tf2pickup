import { z } from 'zod'
import { Etf2lApiError } from '../../../../etf2l/errors/etf2l-api.error'
import { etf2l } from '../../../../etf2l'
import { errors } from '../../../../errors'
import { gamemodeConfigs } from '../../../../gamemodes/configs'
import { players } from '../../../../players'
import type { PlayerSkill } from '../../../../database/models/player.model'
import { Gamemode } from '../../../../shared/types/gamemode'
import { Tf2ClassName } from '../../../../shared/types/tf2-class-name'
import { steamId64 } from '../../../../shared/schemas/steam-id-64'
import { routes } from '../../../../utils/routes'

const paramsSchema = z.object({ steamId: steamId64 })

const skillBodySchema = z.object({
  skill_scout: z.coerce.number().int().min(1).max(5),
  skill_soldier: z.coerce.number().int().min(1).max(5),
  skill_demoman: z.coerce.number().int().min(1).max(5),
  skill_medic: z.coerce.number().int().min(1).max(5),
})

const classSkillFields: Record<Tf2ClassName, keyof z.infer<typeof skillBodySchema>> = {
  [Tf2ClassName.scout]: 'skill_scout',
  [Tf2ClassName.soldier]: 'skill_soldier',
  [Tf2ClassName.demoman]: 'skill_demoman',
  [Tf2ClassName.medic]: 'skill_medic',
  [Tf2ClassName.pyro]: 'skill_soldier',
  [Tf2ClassName.heavy]: 'skill_soldier',
  [Tf2ClassName.engineer]: 'skill_soldier',
  [Tf2ClassName.sniper]: 'skill_soldier',
  [Tf2ClassName.spy]: 'skill_soldier',
}

// eslint-disable-next-line @typescript-eslint/require-await
export default routes(async app => {
  app.post(
    '/',
    {
      config: { authenticate: true },
      schema: {
        params: paramsSchema,
        body: skillBodySchema,
      },
    },
    async (request, reply) => {
      const steamId = request.user!.player.steamId
      if (request.params.steamId !== steamId) {
        throw errors.forbidden('You can only update your own skill')
      }

      const player = await players.bySteamId(steamId, [
        'hasAcceptedRules',
        'skill',
        'skillOnboardingCompletedAt',
        'etf2lSkillVerification',
      ])
      if (!player.hasAcceptedRules) {
        throw errors.forbidden('Accept the rules before setting your skill')
      }
      if (player.skillOnboardingCompletedAt || player.skill?.[Gamemode.sixes]) {
        throw errors.badRequest('Your 6v6 skill has already been set')
      }

      const maxLevel = player.etf2lSkillVerification?.maxLevel ?? 3
      if (Object.values(request.body).some(level => level > maxLevel)) {
        throw errors.forbidden('Verify your ETF2L history before selecting level 4 or 5')
      }

      const skill = Object.fromEntries(
        gamemodeConfigs[Gamemode.sixes].classes.map(({ name }) => [
          name,
          request.body[classSkillFields[name]],
        ]),
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
      request.flash('success', 'Your 6v6 class skills have been saved')
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

      const player = await players.bySteamId(steamId, ['etf2lProfile', 'hasAcceptedRules'])
      if (!player.hasAcceptedRules) {
        throw errors.forbidden('Accept the rules before verifying your skill')
      }
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
          request.flash(
            'error',
            error instanceof Etf2lApiError && error.response.status === 404
              ? 'No ETF2L profile is linked to this Steam account'
              : 'ETF2L is unavailable. You can still choose a level from 1–3.',
          )
          await reply.redirect('/')
          return
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
        request.flash('error', 'ETF2L is unavailable. You can still choose a level from 1–3.')
        return await reply.redirect('/')
      }

      request.flash('success', 'ETF2L history checked')
      await reply.redirect('/')
    },
  )
})
