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

const classLevelDescriptions: Record<Tf2ClassName, [string, string, string, string, string]> = {
  [Tf2ClassName.scout]: [
    'You are still learning Scout movement, double-jumps and close-range tracking. You often need help with positioning and choosing when to take a fight.',
    'You understand the flank role, can use your movement to take and leave fights, and can follow up on your team. Your aim and timing are still inconsistent.',
    'You are a dependable pickup Scout: you hit a reasonable amount of your shots, know when to pressure or protect the flank, and coordinate your fights with your team.',
    'You have strong tracking and movement, take favourable fights consistently, deny space and heals, and know how to time bombs and clean-ups with your combo.',
    'You perform at a top competitive level: you control the flank, create openings without unnecessary deaths, and consistently turn small advantages into round-winning pressure.',
  ],
  [Tf2ClassName.soldier]: [
    'You are learning rocket-jump routes, basic rocket aim and how to stay useful without taking isolated fights.',
    'You can perform basic bombs, hold space with spam and support your combo, but your jumps, timing and damage are not yet consistent.',
    'You are a reliable pickup Soldier: you land useful spam, coordinate bombs, protect your Medic and understand when to hold or give space.',
    'You have strong rocket mechanics and rollout knowledge, time bombs well, pressure key targets and create space while keeping deaths under control.',
    'You play Soldier at a top competitive level: your jumps, damage and timing consistently break holds, force resources and shape the pace of the game.',
  ],
  [Tf2ClassName.demoman]: [
    'You are learning basic pipe aim, sticky placement, traps and how to stay with your team instead of getting caught alone.',
    'You can provide useful spam, set simple traps and follow your combo, but your damage, trap timing and positioning are inconsistent.',
    'You are a dependable pickup Demoman: you control doors and key areas, build useful traps, deal consistent damage and coordinate with your Medic.',
    'You have strong pipe and sticky mechanics, excellent area control, smart trap timing and the ability to punish pushes or create openings.',
    'You play Demoman at a top competitive level: your damage, prediction and area control consistently dictate where the enemy can move.',
  ],
  [Tf2ClassName.medic]: [
    'You are learning heal priorities, staying out of danger, building ÜberCharge and using it without losing your life.',
    'You usually keep the right players alive, understand basic Über timing and stay with your combo, but positioning and decisions can be inconsistent.',
    'You are a reliable pickup Medic: you build and use ÜberCharge sensibly, communicate advantages, avoid unnecessary deaths and support your team.',
    'You have excellent positioning and survival, manage Über exchanges and advantages well, and make fast decisions under pressure.',
    'You play Medic at a top competitive level: exceptional survival, positioning, Über management and decision-making consistently give your team the initiative.',
  ],
  [Tf2ClassName.pyro]: [
    'You are learning basic positioning, airblasts and how to protect teammates from projectiles.',
    'You can support your team with airblasts and close-range pressure, but your timing and positioning are inconsistent.',
    'You understand your support role, protect key teammates and use airblast and damage at the right moments.',
    'You consistently deny projectiles and bombs, protect your combo and recognise when to switch between support and aggression.',
    'You make high-impact defensive and offensive plays, repeatedly denying key enemy pushes while creating opportunities for your team.',
  ],
  [Tf2ClassName.heavy]: [
    'You are learning when to spin up, where to position and how to avoid being caught away from your team.',
    'You can hold useful positions and protect teammates, but your movement, timing and target choices need work.',
    'You reliably anchor positions, protect your team and choose good moments to commit to fights.',
    'You have strong positioning and target priority, deny pushes and coordinate your presence with your team.',
    'You consistently control space and key fights through excellent positioning, timing and high-impact decisions.',
  ],
  [Tf2ClassName.engineer]: [
    'You are learning building placement, maintenance and how to avoid losing your setup unnecessarily.',
    'You can maintain a useful nest and support your team, but setup choices and rotation timing are inconsistent.',
    'You build dependable setups, manage resources and adapt your buildings to the needs of the team.',
    'You anticipate pushes, rotate and rebuild efficiently, and make strong decisions about when to protect or abandon a setup.',
    'You consistently maximise team value through exceptional setup placement, timing, adaptation and survival.',
  ],
  [Tf2ClassName.sniper]: [
    'You are learning sightlines, basic aim and how to avoid exposing yourself unnecessarily.',
    'You can hold useful sightlines and land occasional picks, but your consistency and positioning need work.',
    'You are a reliable pick threat, understand sightlines and coordinate your pressure with the team.',
    'You consistently threaten key targets, reposition intelligently and create space through accurate, timely picks.',
    'You exert top-level control over sightlines and key targets, forcing the enemy to change its plans around you.',
  ],
  [Tf2ClassName.spy]: [
    'You are learning disguise, cloak management and when an approach is safe.',
    'You can find occasional opportunities, but your timing, target selection and survival are inconsistent.',
    'You recognise useful pick opportunities, communicate information and avoid low-value attempts.',
    'You choose high-impact targets, time picks around fights and use information to create advantages for your team.',
    'You consistently create decisive openings through exceptional timing, target selection, information and execution.',
  ],
}

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
              Rate yourself separately on each 6v6 class. The descriptions are class-specific:
              choose the level that best matches how you currently play that class, not your overall
              experience.
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
                  <div class="flex flex-col gap-2">
                    {[1, 2, 3, 4, 5].map(level => (
                      <label
                        class={[
                          'flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3',
                          level > maxLevel && 'cursor-not-allowed opacity-40',
                        ]}
                      >
                        <input
                          class="mt-1"
                          type="radio"
                          name={'skill_' + name}
                          value={String(level)}
                          disabled={level > maxLevel}
                          required
                        />
                        <span class="flex flex-col gap-1">
                          <span class="font-semibold">Level {level}</span>
                          <span class="text-sm text-zinc-300" safe>
                            {classLevelDescriptions[name][level - 1]}
                          </span>
                          {level === 4 && (
                            <span class="text-xs text-zinc-500">
                              Requires ETF2L High / Division 1–2 verification
                            </span>
                          )}
                          {level === 5 && (
                            <span class="text-xs text-zinc-500">
                              Requires ETF2L Premiership verification
                            </span>
                          )}
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

          <form
            action={'/players/' + actor.player.steamId + '/skill-onboarding/verify'}
            method="post"
          >
            <button type="submit" class="button" data-variant="secondary">
              {verification ? 'Check ETF2L history again' : 'Verify ETF2L history'}
            </button>
          </form>
          <p class="text-xs text-zinc-500">
            ETF2L verification checks completed 6v6 matches and unlocks higher choices for each
            class. Your selected skill remains your own assessment.
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
