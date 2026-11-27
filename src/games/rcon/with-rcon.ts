import { Rcon as RconClient } from 'rcon-client'
import { secondsToMilliseconds } from 'date-fns'
import { type GameModel } from '../../database/models/game.model'
import { logger } from '../../logger'
import { errors } from '../../errors'
import type { RconCommand } from '../../shared/types/rcon-command'

export interface Rcon {
  send: (command: RconCommand) => Promise<string>
}

export async function withRcon<T>(
  game: Pick<GameModel, 'number' | 'gameServer'>,
  callback: (args: { rcon: Rcon }) => Promise<T>,
): Promise<T> {
  logger.trace({ gameNumber: game.number }, `withRcon()`)
  if (game.gameServer === undefined) {
    throw errors.internalServerError(`gameServer is undefined`)
  }

  const { address, port, password } = game.gameServer.rcon
  const timeout = secondsToMilliseconds(30)
  const rcon = await RconClient.connect({
    host: address,
    port: Number(port),
    password,
    timeout,
    connectTimeout: timeout,
  })

  rcon.on('disconnect', error => {
    if (error) {
      logger.error(error, `game #${game.number}: rcon error`)
    }
  })

  let callbackFailed = false
  try {
    return await callback({ rcon })
  } catch (error) {
    callbackFailed = true
    throw error
  } finally {
    try {
      await rcon.end()
    } catch (error) {
      // Closing an RCON socket can fail after the server has already closed it.
      // Do not turn a successfully completed configuration into a failed attempt,
      // or mask the original command error with a secondary cleanup error.
      logger.warn(
        { error, callbackFailed },
        `game #${game.number}: failed to close rcon connection`,
      )
    }
  }
}
