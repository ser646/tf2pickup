import { collections } from '../../../database/collections'
import { Gamemode } from '../../../shared/types/gamemode'
import type { User } from '../../../auth/types/user'

export async function SkillOnboardingDialog(props: { actor?: User | undefined }) {
  const actor = props.actor
  if (!actor?.player.hasAcceptedRules) return <></>

  const player = await collections.players.findOne(
    { steamId: actor.player.steamId },
    {
      projection: {
        skill: 1,
        skillOnboardingCompletedAt: 1,
        etf2lSkillVerification: 1,
      },
    },
  )

  if (!player || player.skillOnboardingCompletedAt || player.skill?.[Gamemode.sixes]) {
    return <></>
  }

  const verification = player.etf2lSkillVerification
  const maxLevel = verification?.maxLevel ?? 3
  const id = 'skill-onboarding-dialog'

  return (
    <>
      <dialog
        id={id}
        class="m-auto w-[min(100%-32px,560px)] max-h-[calc(100vh-48px)] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-6 text-zinc-100 shadow-2xl backdrop:bg-black/75"
        aria-labelledby="skill-onboarding-title"
      >
        <div class="flex flex-col gap-5">
          <div>
            <h2 id="skill-onboarding-title" class="text-2xl font-bold">Choose your 6v6 skill</h2>
            <p class="mt-2 text-sm text-zinc-300">
              Select the level that best represents your current 6v6 experience. Levels 1–3 are
              available to everyone. ETF2L history verification can unlock levels 4–5.
            </p>
          </div>

          {verification ? (
            <p class="rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm" role="status">
              {verification.maxLevel >= 5
                ? 'ETF2L verified: Premiership history found. Levels 1–5 are unlocked.'
                : verification.maxLevel >= 4
                  ? 'ETF2L verified: High / Division 1–2 history found. Levels 1–4 are unlocked.'
                  : 'ETF2L checked: no qualifying High or Premiership history found. Levels 1–3 are available.'}
              {verification.highestDivision
                ? ' Highest qualifying division: ' + verification.highestDivision + '.'
                : ''}
            </p>
          ) : (
            <p class="text-sm text-zinc-400">
              You can verify your ETF2L history now, or choose a level from 1–3 without verification.
            </p>
          )}

          <form action={'/players/' + actor.player.steamId + '/skill-onboarding'} method="post">
            <fieldset class="flex flex-col gap-3">
              <legend class="mb-2 font-semibold">Your skill level</legend>
              {[1, 2, 3, 4, 5].map(level => (
                <label
                  class={[
                    'flex items-center gap-3 rounded-md border border-zinc-700 p-3',
                    level > maxLevel && 'cursor-not-allowed opacity-40',
                  ]}
                >
                  <input
                    type="radio"
                    name="skillLevel"
                    value={level}
                    checked={level === 1}
                    disabled={level > maxLevel}
                    required
                  />
                  <span class="font-semibold">Level {level}</span>
                  {level === 4 && (
                    <span class="text-sm text-zinc-400">ETF2L High / Division 1–2</span>
                  )}
                  {level === 5 && (
                    <span class="text-sm text-zinc-400">ETF2L Premiership</span>
                  )}
                </label>
              ))}
            </fieldset>
            <div class="mt-5">
              <button type="submit" class="button" data-variant="accent">Save skill</button>
            </div>
          </form>

          <form action={'/players/' + actor.player.steamId + '/skill-onboarding/verify'} method="post">
            <button type="submit" class="button" data-variant="secondary">
              {verification ? 'Check ETF2L history again' : 'Verify ETF2L history'}
            </button>
          </form>
          <p class="text-xs text-zinc-500">
            Verification checks completed ETF2L 6v6 matches. It only unlocks the levels; you choose your own level.
          </p>
        </div>
      </dialog>
      <script>{`
        const dialog = document.getElementById('${id}');
        if (dialog && !dialog.open) dialog.showModal();
      `}</script>
    </>
  )
}
