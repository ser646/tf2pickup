import { collections } from '../../../database/collections'
import { Gamemode } from '../../../shared/types/gamemode'
import type { User } from '../../../auth/types/user'
import { gamemodeConfigs } from '../../../gamemodes/configs'
import { Tf2ClassName } from '../../../shared/types/tf2-class-name'

const classLabels: Record<Tf2ClassName, string> = {
  [Tf2ClassName.scout]: 'Scout',
  [Tf2ClassName.soldier]: 'Soldier',
  [Tf2ClassName.pyro]: 'Pyro',
  [Tf2ClassName.demoman]: 'Demoman',
  [Tf2ClassName.heavy]: 'Heavy',
  [Tf2ClassName.engineer]: 'Engineer',
  [Tf2ClassName.medic]: 'Medic',
  [Tf2ClassName.sniper]: 'Sniper',
  [Tf2ClassName.spy]: 'Spy',
}

const skillLevels = [
  {
    value: 1,
    label: 'Newbie',
    description:
      'You are new to this class in competitive 6v6. You are still learning its role, core responsibilities and common situations.',
    color: 'border-green-500/50 bg-green-500/15 text-green-300 peer-checked:border-green-400 peer-checked:bg-green-600 peer-checked:text-white',
  },
  {
    value: 2,
    label: 'Beginner',
    description:
      'You know the class basics and 6v6 rules, but are still learning positioning, rotations and teamplay. Roughly comparable to an entry-level league player (Open).',
    color: 'border-blue-500/50 bg-blue-500/15 text-blue-300 peer-checked:border-blue-400 peer-checked:bg-blue-600 peer-checked:text-white',
  },
  {
    value: 3,
    label: 'Familiar',
    description:
      'You have some pickup or scrim experience. You understand your role, basic rotations, positioning and communication. Roughly in the lower-to-mid league range.',
    color: 'border-yellow-500/50 bg-yellow-500/15 text-yellow-300 peer-checked:border-yellow-400 peer-checked:bg-yellow-600 peer-checked:text-white',
  },
  {
    value: 4,
    label: 'Experienced',
    description:
      'You have solid 6v6 match experience and make reliable decisions under pressure. You understand game pace, rotations and coordinated teamplay. Roughly around High / Division 1–2.',
    color: 'border-orange-500/50 bg-orange-500/15 text-orange-300 peer-checked:border-orange-400 peer-checked:bg-orange-600 peer-checked:text-white',
  },
  {
    value: 5,
    label: 'Advanced',
    description:
      'You have extensive high-level 6v6 experience, strong gamesense and consistently effective decision-making. Roughly around Premiership level.',
    color: 'border-red-500/50 bg-red-500/15 text-red-300 peer-checked:border-red-400 peer-checked:bg-red-600 peer-checked:text-white',
  },
] as const

export async function SkillOnboardingDialog(props: { actor?: User | undefined }) {
  const actor = props.actor
  if (!actor) return <></>

  const player = await collections.players.findOne(
    { steamId: actor.player.steamId },
    {
      projection: {
        hasAcceptedRules: 1,
        skill: 1,
        skillOnboardingCompletedAt: 1,
        etf2lSkillVerification: 1,
      },
    },
  )

  if (
    !player?.hasAcceptedRules ||
    player.skillOnboardingCompletedAt ||
    player.skill?.[Gamemode.sixes]
  ) {
    return <></>
  }

  const verification = player.etf2lSkillVerification
  const maxLevel = verification?.maxLevel ?? 3
  const classes = gamemodeConfigs[Gamemode.sixes].classes
  const id = 'skill-onboarding-dialog'

  return (
    <>
      <dialog
        id={id}
        class="m-auto max-h-[calc(100vh-48px)] w-[min(100%-32px,720px)] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-6 text-zinc-100 shadow-2xl backdrop:bg-black/75"
        aria-labelledby="skill-onboarding-title"
      >
        <div class="flex flex-col gap-5">
          <div>
            <h2 id="skill-onboarding-title" class="text-2xl font-bold">
              Choose your 6v6 class skills
            </h2>
            <p class="mt-2 text-sm text-zinc-300">
              Pick one simple tag for each class. Choose <strong>Newbie</strong> only if you are new
              to playing that class in competitive 6v6.
            </p>
          </div>

          {verification ? (
            <p class="rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm" role="status">
              {verification.maxLevel >= 5
                ? 'ETF2L verified: Premiership history found. Levels 1–5 are unlocked for every class.'
                : verification.maxLevel >= 4
                  ? 'ETF2L verified: High / Division 1–2 history found. Levels 1–4 are unlocked for every class.'
                  : 'ETF2L checked: no qualifying High or Premiership history found. Levels 1–3 are available for every class.'}
              {verification.highestDivision
                ? ' Highest qualifying division: ' + verification.highestDivision + '.'
                : ''}
            </p>
          ) : (
            <p class="text-sm text-zinc-400">
              You can verify your ETF2L history now, or choose levels 1–3 for each class without
              verification. Verification only unlocks levels 4–5; it does not choose your levels for
              you.
            </p>
          )}

          <form action={'/players/' + actor.player.steamId + '/skill-onboarding'} method="post">
            <div class="flex flex-col gap-5">
              {classes.map(({ name }) => (
                <fieldset class="rounded-md border border-zinc-700 p-4">
                  <legend class="px-2 text-lg font-bold" safe>
                    {classLabels[name]}
                  </legend>
                  <div class="flex flex-wrap gap-2">
                    {skillLevels.map(({ value, label, color, description }) => (
                      <label class="group relative cursor-pointer">
                        <input
                          class="peer sr-only"
                          type="radio"
                          name={'skill_' + name}
                          value={String(value)}
                          disabled={value > maxLevel}
                          required
                        />
                        <span
                          aria-describedby={'skill-tooltip-' + name + '-' + value}
                          class={[
                            'inline-flex min-w-24 justify-center rounded-full border px-4 py-2 text-sm font-semibold transition',
                            color,
                            'peer-checked:shadow-md',
                            value > maxLevel && 'cursor-not-allowed opacity-30',
                          ]}
                        >
                          {label}
                        </span>
                        <span
                          id={'skill-tooltip-' + name + '-' + value}
                          role="tooltip"
                          class={[
                            'pointer-events-none absolute bottom-full z-50 mb-3 w-64 max-w-[calc(100vw-64px)] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-zinc-200 opacity-0 shadow-xl shadow-black/40 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
                            value <= 2 ? 'left-0' : value >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                          ]}
                        >
                          {description}
                          <span class="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div class="mt-5">
              <button type="submit" class="button" data-variant="accent">
                Save class skills
              </button>
            </div>
          </form>

          {!verification && (
            <form
              action={'/players/' + actor.player.steamId + '/skill-onboarding/verify'}
              method="post"
              hx-post={'/players/' + actor.player.steamId + '/skill-onboarding/verify'}
              hx-target="#skill-onboarding-dialog"
              hx-swap="outerHTML"
            >
              <button type="submit" class="button" data-variant="secondary">
                Verify ETF2L history
              </button>
            </form>
          )}
          <p class="text-xs text-zinc-400">
            These are self-assessed skill tags for each class in 6v6 pickups, not official ETF2L
            divisions. The division examples above are only a rough guide, not an automatic
            conversion.
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
