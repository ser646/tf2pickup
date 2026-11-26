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
  const voiceConfigured = configuredGuilds.length === 1 && !!discord.client?.isReady()

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
        ) : (
          <>
            <p class="flex-1">Link your Discord account to join your team's private match voice channel.</p>
            <button
              class="button"
              data-variant="accent"
              hx-post="/discord/link"
            >
              Generate linking code
            </button>
          </>
        )}
      </div>
      {props.generatedCode && !player.discordLink && voiceConfigured && (
        <div class="mx-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <p class="font-semibold">Your one-time linking code</p>
          <p class="my-3 break-all font-mono text-2xl tracking-widest" safe>
            {props.generatedCode}
          </p>
          <p class="text-sm text-zinc-200">
            In the configured Discord server, run <code>/link</code> and paste this code. It expires
            in 10 minutes and is shown only once.
          </p>
        </div>
      )}
    </div>
  )
}
