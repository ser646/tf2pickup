import { configuration } from '../../../../configuration'
import { Switch } from '../../../../html/components/switch'
import { SaveButton } from '../../../views/html/save-button'
import { Admin } from '../../../views/html/admin'

export async function MiscellaneousPage() {
  const skillOnboardingEnabled = await configuration.get('players.skill_onboarding_enabled')

  return (
    <Admin activePage="miscellaneous">
      <form action="" method="post">
        <div class="admin-panel-set flex flex-col gap-4">
          <div class="group flex flex-row items-center justify-between">
            <dl>
              <dt>
                <label class="text-zinc-200" for="skillOnboardingEnabled">
                  Skill onboarding
                </label>
              </dt>
              <dd class="text-zinc-200">
                <span class="hidden group-has-checked:inline-block">
                  Players are asked to choose their 6v6 class skill levels when they visit the
                  pickup page
                </span>
                <span class="group-has-checked:hidden">
                  The skill onboarding welcome dialog is disabled. Existing pickup behaviour is
                  unchanged.
                </span>
              </dd>
            </dl>
            <Switch
              id="skillOnboardingEnabled"
              name="skillOnboardingEnabled"
              value="true"
              checked={skillOnboardingEnabled}
            />
          </div>
          <p>
            <SaveButton />
          </p>
        </div>
      </form>
    </Admin>
  )
}
