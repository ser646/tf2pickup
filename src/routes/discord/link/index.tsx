import { addMinutes, format } from 'date-fns'
import { createHash, randomBytes } from 'node:crypto'
import { routes } from '../../../utils/routes'
import { players } from '../../../players'
import { configuration } from '../../../configuration'
import { discord } from '../../../discord'
import { Layout } from '../../../html/layout'
import { NavigationBar } from '../../../html/components/navigation-bar'
import { Page } from '../../../html/components/page'
import { Footer } from '../../../html/components/footer'
import { makeTitle } from '../../../html/make-title'

// eslint-disable-next-line @typescript-eslint/require-await
export default routes(async app => {
  app
    .get('/', async (request, reply) => {
      if (!request.user) {
        return reply.redirect('/auth/steam')
      }
      reply.header('Cache-Control', 'no-store')

      const player = await players.bySteamId(request.user.player.steamId, ['name', 'discordLink'])
      const configuredGuilds = (await configuration.get('discord.guilds')).filter(
        ({ voiceServer }) => voiceServer !== undefined,
      )

      return reply.html(
        DiscordLinkPage({
          name: player.name,
          discordLink: player.discordLink,
          voiceConfigured: configuredGuilds.length === 1 && !!discord.client?.isReady(),
        }),
      )
    })
    .post('/', async (request, reply) => {
      if (!request.user) {
        return reply.redirect('/auth/steam')
      }
      reply.header('Cache-Control', 'no-store')

      const configuredGuilds = (await configuration.get('discord.guilds')).filter(
        ({ voiceServer }) => voiceServer !== undefined,
      )
      if (configuredGuilds.length !== 1 || !discord.client?.isReady()) {
        return reply.badRequest(
          'Discord match voice is not configured yet. Contact an administrator.',
        )
      }

      const player = await players.bySteamId(request.user.player.steamId, ['name', 'discordLink'])
      if (player.discordLink) {
        return reply.badRequest('A Discord account is already linked. Unlink it first.')
      }

      const code = randomBytes(12).toString('hex').toUpperCase()
      const hash = createHash('sha256').update(code).digest('hex')
      await players.update(request.user.player.steamId, before => {
        if (before.discordLink) {
          return { $unset: { discordLinkCode: 1 } }
        }

        return {
          $set: {
            discordLinkCode: {
              hash,
              expiresAt: addMinutes(new Date(), 10),
            },
          },
        }
      })

      const latestPlayer = await players.bySteamId(request.user.player.steamId, [
        'name',
        'discordLink',
        'discordLinkCode.hash',
      ])

      return reply.html(
        DiscordLinkPage({
          name: latestPlayer.name,
          discordLink: latestPlayer.discordLink,
          voiceConfigured: true,
          generatedCode:
            !latestPlayer.discordLink && latestPlayer.discordLinkCode?.hash === hash
              ? code
              : undefined,
        }),
      )
    })
    .post('/unlink', async (request, reply) => {
      if (!request.user) {
        return reply.redirect('/auth/steam')
      }
      reply.header('Cache-Control', 'no-store')

      await players.update(request.user.player.steamId, {
        $unset: { discordLink: 1, discordLinkCode: 1 },
      })

      return reply.redirect('/discord/link')
    })
})

function DiscordLinkPage(props: {
  name: string
  discordLink?: { userId: string; linkedAt: Date } | undefined
  voiceConfigured: boolean
  generatedCode?: string | undefined
}) {
  return (
    <Layout title={makeTitle('Link Discord account')}>
      <NavigationBar wide />
      <Page>
        <section class="mx-auto flex max-w-2xl flex-col gap-4">
          <h1 class="text-3xl font-bold">Link your Discord account</h1>
          <p>
            Signed in as <strong safe>{props.name}</strong> through Steam. Link your Discord account
            so the match bot can give you access to your team's private voice channel.
          </p>
          {props.discordLink ? (
            <>
              <div class="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                <p class="font-semibold">Discord account linked</p>
                <p class="mt-1 text-sm text-zinc-200">
                  Discord user ID: <code safe>{props.discordLink.userId}</code>
                </p>
                <p class="text-sm text-zinc-200" safe>
                  Linked at {format(props.discordLink.linkedAt, 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
              <form method="post" action="/discord/link/unlink">
                <button type="submit" class="button" data-variant="darker">
                  Unlink Discord account
                </button>
              </form>
            </>
          ) : !props.voiceConfigured ? (
            <p class="text-sm text-zinc-200">
              Discord match voice is not configured yet. An administrator must select the TF2
              MATCHES category and LOBBY channel in Admin &gt; Discord first.
            </p>
          ) : (
            <>
              {props.generatedCode ? (
                <div class="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                  <p class="font-semibold">Your one-time linking code</p>
                  <p class="my-3 font-mono text-2xl tracking-widest break-all" safe>
                    {props.generatedCode}
                  </p>
                  <p class="text-sm text-zinc-200">
                    In the configured Discord server, run <code>/link</code> and paste this code. It
                    expires in 10 minutes. This code is shown only once.
                  </p>
                </div>
              ) : (
                <p class="text-sm text-zinc-200">
                  Generate a one-time code, then use the <code>/link</code> command in the
                  configured Discord server. The code is valid for 10 minutes.
                </p>
              )}
              <form method="post" action="/discord/link">
                <button type="submit" class="button" data-variant="accent">
                  Generate linking code
                </button>
              </form>
            </>
          )}
        </section>
      </Page>
      <Footer />
    </Layout>
  )
}
