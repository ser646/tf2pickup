import type { SteamId64 } from '../../../shared/types/steam-id-64'
import { players } from '../../../players'
import { configuration } from '../../../configuration'
import { discord } from '../../index'
import { IconBrandDiscord } from '../../../html/components/icons'
import { decryptLinkingCode } from '../../linking-code'

export async function DiscordSettingsEntry(props: { steamId: SteamId64 }) {
  const player = await players.bySteamId(props.steamId, [
    'discordLink',
    'discordLinkCode.encryptedCode',
    'discordLinkCode.expiresAt',
  ])
  const codeExpiresAt = player.discordLinkCode?.expiresAt
  const generatedCode =
    player.discordLinkCode?.encryptedCode && codeExpiresAt && codeExpiresAt > new Date()
      ? decryptLinkingCode(player.discordLinkCode.encryptedCode)
      : undefined
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
      {...(generatedCode && !player.discordLink
        ? { 'hx-get': '/discord/link/status', 'hx-trigger': 'every 3s' }
        : {})}
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
              <p class="text-sm text-zinc-400" safe>
                Linked on {player.discordLink.linkedAt.toLocaleDateString()}
              </p>
            </div>
            <button class="button" data-variant="darker" hx-post="/discord/link/unlink">
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
        ) : generatedCode ? (
          <p class="flex-1">Finish linking your Discord account using the details below.</p>
        ) : (
          <>
            <p class="flex-1">
              Link your Discord account to access your team's private match voice channel.
            </p>
            <button class="button" data-variant="accent" hx-post="/discord/link">
              <IconBrandDiscord size={18} />
              Link Discord
            </button>
          </>
        )}
      </div>
      {!!generatedCode && !player.discordLink && canGenerateLinkingCode && (
        <div class="mx-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <a
            class="button mb-4"
            data-variant="darker"
            href={inviteLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconBrandDiscord size={18} />
            Join Discord server
          </a>
          <p class="text-sm text-zinc-400">
            Your linking code
            <span class="ml-2">
              · Expires in{' '}
              <span data-countdown-until={codeExpiresAt?.getTime() ?? Date.now()}>10:00</span>
            </span>
          </p>
          <p class="my-2 font-mono text-2xl tracking-widest break-all" safe>
            {generatedCode}
          </p>
          <p class="text-xs text-zinc-400">This code can only be used once.</p>

          <div class="mt-5 border-t border-zinc-700 pt-4">
            <p class="mb-2 font-semibold">Use this command in our Discord server</p>
            <p class="mb-3 text-sm text-zinc-400">
              In Discord, type `/link`, select the command, and paste the value into its `code`
              field:
            </p>
            <div class="rounded-lg border border-zinc-700 bg-[#2b2d31] p-3">
              <code class="font-mono text-base break-all text-white" safe>
                /link code:{generatedCode}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
