import fp from 'fastify-plugin'
import { events } from '../../events'
import { collections } from '../../database/collections'
import { SlotStatus } from '../../database/models/game-slot.model'
import { runningGameStates } from '../lifecycle/running-game-states'
import { GamesLink } from '../../html/components/games-link'
import { ServerReadyNotification } from '../views/html/server-ready-notification'
import { gamePage } from '../page'
import { ConnectInfo } from '../views/html/connect-info'
import { gamePageUrl } from '../page/game-page-url'
import { safe } from '../../utils/safe'

// eslint-disable-next-line @typescript-eslint/require-await
export default fp(async app => {
  events.on('game:updated', ({ before, after }) => {
    gamePage.sync(app.gateway, before, after)

    if (after.connectString !== undefined && before.connectString !== after.connectString) {
      app.gateway
        .to({ players: after.slots.map(({ player }) => player) })
        .send(async actor => await ServerReadyNotification(actor!))
    }
  })

  async function refreshGamesLink() {
    const cmp = await GamesLink()
    app.gateway.broadcast(() => cmp)
  }
  events.on('game:created', refreshGamesLink)
  events.on('game:ended', refreshGamesLink)

  events.on(
    'player:updated',
    safe(async ({ before, after }) => {
      if (before.discordLink?.userId === after.discordLink?.userId) {
        return
      }

      const game = await collections.games.findOne({
        state: { $in: runningGameStates },
        slots: {
          $elemMatch: {
            player: after.steamId,
            status: { $in: [SlotStatus.active, SlotStatus.waitingForSubstitute] },
          },
        },
      })
      if (!game) {
        return
      }

      app.gateway
        .to({ url: gamePageUrl(game.number) })
        .to({ player: after.steamId })
        .send(actor => ConnectInfo({ game, actor }), { key: 'connect-info' })
    }),
  )
})
