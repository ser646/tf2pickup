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
      ? await decryptLinkingCode(player.discordLinkCode.encryptedCode)
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
        ) : generatedCode ? (
          <>
            <p class="flex-1">Your active linking code is shown below.</p>
          </>
        ) : (
          <>
            <p class="flex-1">
              Link your Discord account to access your team's private match voice channel.
            </p>
            <div class="flex flex-wrap items-center gap-2">
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
      {!!generatedCode && !player.discordLink && canGenerateLinkingCode && (
        <div class="mx-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <p class="text-sm text-zinc-400">
            Your linking code
            <span class="ml-2">
              · Expires in{' '}
              <span
                data-countdown-until={(
                  codeExpiresAt ?? new Date()
                ).getTime()}
              >
                10:00
              </span>
            </span>
          </p>
          <p class="my-2 break-all font-mono text-2xl tracking-widest" safe>
            {generatedCode}
          </p>
          <p class="text-xs text-zinc-400">
            This code can only be used once.
          </p>

          <div class="mt-5 border-t border-zinc-700 pt-4">
            <p class="mb-3 font-semibold">How to link your account in Discord</p>
            <ol class="space-y-4">
              <li class="flex items-start gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold"
                >
                  1
                </span>
                <div class="min-w-0 flex-1">
                  <p class="mb-2 text-sm">
                    Open our Discord server and type <code>/link</code> in a text channel.
                  </p>
                  <div class="rounded-lg border border-zinc-700 bg-[#313338] p-3">
                    <p class="mb-2 text-xs text-zinc-400">MESSAGE</p>
                    <div
                      class="inline-flex items-center gap-2 rounded bg-[#4752c4] px-3 py-2 font-mono text-sm text-white"
                    >
                      <span class="rounded bg-white/20 px-1">/</span> link
                    </div>
                  </div>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold"
                >
                  2
                </span>
                <div class="min-w-0 flex-1">
                  <p class="mb-2 text-sm">
                    Select the <code>/link</code> command from the suggestions.
                  </p>
                  <div class="rounded-lg border border-zinc-700 bg-[#2b2d31] p-3">
                    <div class="flex items-center gap-2 text-sm text-white">
                      <span class="rounded bg-[#4752c4] px-2 py-1 font-mono">/</span>
                      <span class="font-semibold">link</span>
                      <span class="text-xs text-zinc-400">Link your game account</span>
                    </div>
                  </div>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold"
                >
                  3
                </span>
                <div class="min-w-0 flex-1">
                  <p class="mb-2 text-sm">
                    Paste your code into the <code>code</code> field and send the command.
                  </p>
                  <div class="rounded-lg border border-zinc-700 bg-[#2b2d31] p-3">
                    <div class="mb-2 flex items-center gap-2 text-sm text-white">
                      <span class="rounded bg-[#4752c4] px-2 py-1 font-mono">/</span>
                      <span class="font-semibold">link</span>
                    </div>
                    <div class="rounded border border-[#5865f2] bg-[#1e1f22] p-2">
                      <p class="mb-1 text-xs text-zinc-400">code</p>
                      <p class="break-all font-mono text-sm text-white" safe>{generatedCode}</p>
                    </div>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
