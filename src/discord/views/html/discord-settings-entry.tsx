import type { SteamId64 } from '../../../shared/types/steam-id-64'
import { players } from '../../../players'
import { configuration } from '../../../configuration'
import { discord } from '../../index'
import { IconBrandDiscord } from '../../../html/components/icons'

export async function DiscordSettingsEntry(props: {
  steamId: SteamId64
  generatedCode?: string
}) {
  const player = await players.bySteamId(props.steamId, ['discordLink'])
  const configuredGuilds = (await configuration.get('discord.guilds')).filter(
    ({ voiceServer }) => voiceServer !== undefined,
  )
  const inviteLink = await configuration.get('misc.discord_invite_link')
  const voiceConfigured = configuredGuilds.length === 1 && !!discord.client?.isReady()
  const canGenerateLinkingCode = voiceConfigured && !!inviteLink

  return (
    <div
      id="discord-settings-entry"
      class="flex flex-col gap-3"
      hx-target="this"
      hx-swap="outerHTML"
    >
      <div class="page-actions flex-row items-center gap-x-8! px-5">
        <p class="flex items-center gap-1 text-2xl font-bold">
          <IconBrandDiscord size={24} />
          Discord
        </p>
        {player.discordLink ? (
          <>
            <div class="flex-1">
              <p>Discord account linked</p>
              <p class="text-sm text-zinc-400">
                Linked on {player.discordLink.linkedAt.toLocaleDateString()}
              </p>
            </div>
            <button
              class="button"
              data-variant="darker"
              hx-post="/discord/link/unlink"
            >
              Unlink
            </button>
          </>
        ) : !voiceConfigured ? (
          <p class="flex-1 text-sm text-zinc-300">
            Discord match voice is not configured. Contact an administrator.
          </p>
        ) : !inviteLink ? (
          <p class="flex-1 text-sm text-zinc-300">
            The Discord server invite link has not been configured. Contact an administrator.
          </p>
        ) : (
          <>
            <p class="flex-1">
              Join the Discord server, then link your account to access your team's private match voice channel.
            </p>
            <div class="flex flex-wrap items-center gap-2">
              {inviteLink ? (
                <a
                  class="button"
                  data-variant="darker"
                  href={inviteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconBrandDiscord size={18} />
                  Join Discord server
                </a>
              ) : (
                <button
                  class="button"
                  data-variant="darker"
                  type="button"
                  disabled
                  title="The Discord invite link has not been configured"
                >
                  <IconBrandDiscord size={18} />
                  Join Discord server
                </button>
              )}
              <button
                class="button"
                data-variant="accent"
                hx-post="/discord/link"
              >
                Generate linking code
              </button>
            </div>
          </>
        )}
      </div>
      {props.generatedCode && !player.discordLink && canGenerateLinkingCode && (
        <div class="mx-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <p class="font-semibold">Finish linking your Discord account</p>
          <ol class="my-3 list-decimal space-y-2 pl-5 text-sm text-zinc-200">
            <li>
              {inviteLink
                ? "Join the Discord server using the button below, if you haven't already."
                : "Join the configured Discord server, if you haven't already. Ask an administrator for an invite link if needed."}
            </li>
            <li>Open the server and enter <code>/link</code> in any channel where you can use bot commands.</li>
            <li>Paste the one-time code into the command's <code>code</code> field and submit it.</li>
          </ol>
          {inviteLink ? (
            <a
              class="button"
              data-variant="darker"
              href={inviteLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandDiscord size={18} />
              Join Discord server
            </a>
          ) : (
            <button
              class="button"
              data-variant="darker"
              type="button"
              disabled
              title="The Discord invite link has not been configured"
            >
              <IconBrandDiscord size={18} />
              Join Discord server
            </button>
          )}
          <p class="mt-4 text-sm text-zinc-400">Your one-time code (expires in 10 minutes):</p>
          <p class="my-2 break-all font-mono text-2xl tracking-widest" safe>
            {props.generatedCode}
          </p>
          <p class="text-xs text-zinc-400">
            The code is shown only once and can only be used once. If it expires, generate a new one.
          </p>
        </div>
      )}
    </div>
  )
}
