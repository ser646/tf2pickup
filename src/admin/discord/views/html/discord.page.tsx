import { Admin } from '../../../views/html/admin'
import { DiscordConfiguration } from './discord-configuration'
import { IconX } from '../../../../html/components/icons'
import { discord } from '../../../../discord'
import { configuration } from '../../../../configuration'
import { SaveButton } from '../../../views/html/save-button'

export async function DiscordPage() {
  const discordInviteLink = await configuration.get('misc.discord_invite_link')

  return (
    <Admin activePage="discord">
      <div class="admin-panel-set mb-8">
        <form action="/admin/discord/invite-link" method="post">
          <dl>
            <dt>
              <label for="discord-invite-link" class="font-medium">
                Discord invite link
              </label>
            </dt>
            <dd>
              <input
                type="url"
                id="discord-invite-link"
                name="discordInviteLink"
                value={discordInviteLink ?? ''}
                placeholder="https://discord.gg/..."
              />
            </dd>
          </dl>
          <p class="mt-4">
            <SaveButton />
          </p>
        </form>
      </div>
      <div class="admin-panel-set">
        {discord.client?.isReady() ? (
          <DiscordConfiguration client={discord.client} />
        ) : (
          <>
            <h4>
              <span class="flex flex-row text-red-600">
                <IconX />
                disabled
              </span>
            </h4>
            <span>
              In order to enable discord integration you have to provide the{' '}
              <code>DISCORD_BOT_TOKEN</code> environment variable.
            </span>
          </>
        )}
      </div>
    </Admin>
  )
}
