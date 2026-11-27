import { requestContext } from '@fastify/request-context'
import type { User } from '../../../../auth/types/user'
import { configuration } from '../../../../configuration'
import { collections } from '../../../../database/collections'
import { PlayerRole } from '../../../../database/models/player.model'
import type { QueueModel } from '../../../../database/models/queue.model'
import type { QueueSlotModel } from '../../../../database/models/queue-slot.model'
import { gamemodeConfigs } from '../../../../gamemodes/configs'
import { GameClassIcon } from '../../../../html/components/game-class-icon'
import { Gamemode } from '../../../../shared/types/gamemode'
import { players } from '../../../../players'
import { PreReadyUpButton } from '../../../../pre-ready/views/html/pre-ready-up-button'
import type { SteamId64 } from '../../../../shared/types/steam-id-64'
import { queues } from '../../..'
import { CurrentPlayerCount } from '../../../views/html/current-player-count'
import { IsInQueue } from '../../../views/html/is-in-queue'
import { MapVote } from './map-vote'
import { MapVoteSelection } from './map-vote-selection'
import { QueueSlot } from './queue-slot'
import { SingleClassQueueSlot } from './single-class-queue-slot'
import { QueueSwitcher } from '../../../views/html/queue-switcher'
import { StreamList } from '../../../views/html/stream-list'
import { TeamPlayerCount } from './team-player-count'
import { teamSlots } from './team-slots'
import { VoiceServerType } from '../../../../shared/types/voice-server-type'
import { ClassPreferences } from './class-preferences'
import { IconBrandDiscord } from '../../../../html/components/icons'

export async function AutoQueueContent(props: { queue: QueueModel }) {
  const { queue } = props
  const slots = await collections.queueSlots.find({ queue: queue._id }).toArray()
  const required = slots.length
  const user = requestContext.get('user')

  return (
    <div id="queue-content" class="tab-content max-lg:order-3 lg:contents!">
      <div class="queue-toolbar" id="queue-toolbar" tabindex="-1">
        <IsInQueue queue={queue._id} actor={user?.player.steamId} />
        <MapVoteSelection queue={queue._id} actor={user?.player.steamId} />
        <QueueSwitcher active={queue} actor={user?.player.steamId} />
        <QueueState queue={queue} actor={user} required={required} />
      </div>
      <div class="queue-content">
        <DiscordLinkNotice actor={user?.player.steamId} />
        <Queue queue={queue} slots={slots} actor={user?.player.steamId} />
        <MapVote queue={queue._id} actor={user?.player.steamId} />
        <StreamList />
      </div>
    </div>
  )
}

async function DiscordLinkNotice(props: { actor?: SteamId64 }) {
  if (!props.actor) {
    return <></>
  }

  const voiceServerType = await configuration.get('games.voice_server_type')
  if (voiceServerType !== VoiceServerType.discord) {
    return <></>
  }

  const player = await players.bySteamId(props.actor, ['discordLink'])
  if (player.discordLink) {
    return <></>
  }

  return (
    <div
      class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="status"
      data-testid="discord-link-required"
    >
      <p class="text-sm">
        To join this queue, you first need to link your Discord account.
      </p>
      <a
        href="/settings#discord-settings-entry"
        class="button"
        data-variant="accent"
        data-umami-event="link-discord-from-queue"
      >
        <IconBrandDiscord size={18} />
        Link Discord account
      </a>
    </div>
  )
}

async function QueueState(props: {
  queue: QueueModel
  actor?: User | undefined
  required: number
}) {
  return (
    <div class="queue-state">
      <form ws-send class="queue-state-form">
        <h1 class="queue-player-count">
          Players <CurrentPlayerCount queue={props.queue._id} />/{props.required}
        </h1>
        <div class="queue-state-actions">
          <ClearQueueButton queue={props.queue} actor={props.actor} />
          <PreReadyUpButton actor={props.actor?.player.steamId} />
        </div>
      </form>
    </div>
  )
}

const gridColsByGamemode: Record<Gamemode, string> = {
  [Gamemode.sixes]: 'xl:grid-cols-4',
  [Gamemode.highlander]: 'xl:grid-cols-3',
  [Gamemode.ultiduo]: 'xl:grid-cols-2',
  [Gamemode.bball]: 'xl:grid-cols-2',
  [Gamemode.fours]: 'xl:grid-cols-4',
  [Gamemode.ultitrio]: 'xl:grid-cols-3',
}

async function Queue(props: {
  queue: QueueModel
  slots: QueueSlotModel[]
  actor?: SteamId64 | undefined
}) {
  const config = gamemodeConfigs[props.queue.gamemode]
  const positions = config.classes.flatMap(gameClass =>
    Array.from({ length: gameClass.count }, (_, classIndex) => ({
      gameClass: gameClass.name,
      classIndex,
    })),
  )
  const gridCols = gridColsByGamemode[props.queue.gamemode]
  const actor = props.actor
    ? await players.bySteamId(props.actor, [
        'steamId',
        'hasAcceptedRules',
        'bans',
        'activeGame',
        'skill',
        'verified',
        'roles',
        'discordLink',
      ])
    : undefined
  const defaultSkill = (await configuration.get('games.default_player_skill'))[props.queue.gamemode]
  const requireDiscordLink =
    (await configuration.get('games.voice_server_type')) === VoiceServerType.discord

  // Keep the original click-a-slot interface unless multi-class is explicitly enabled.
  const teams = teamSlots(props.queue.gamemode, props.slots)
  if (!props.queue.allowMultipleClasses) {
    if (teams.length > 0) {
      const teamNames = ['BLU', 'RED'] as const
      return (
        <form
          id="queue"
          class="queue-compact-grid"
          style={`--team-size: ${positions.length.toString()}`}
          ws-send
          data-disable-when-offline
        >
          <div class="queue-team-heading-spacer" aria-hidden="true"></div>
          {positions.map(position => (
            <h2 class="queue-class-heading">
              <GameClassIcon gameClass={position.gameClass} size={32} />
              <span>{position.gameClass}</span>
            </h2>
          ))}
          {teamNames.map((teamName, teamIndex) => (
            <div class="queue-team-row">
              <div
                class={[
                  'queue-team-summary',
                  teamName === 'BLU' ? 'queue-team-blu' : 'queue-team-red',
                ]}
              >
                <span>{teamName}</span>
                <TeamPlayerCount teamIndex={teamIndex} slots={teams[teamIndex] ?? []} />
              </div>
              {teams[teamIndex]?.map(slot => (
                <SingleClassQueueSlot
                  queue={props.queue}
                  slot={slot}
                  actor={actor}
                  defaultSkill={defaultSkill}
                  requireDiscordLink={requireDiscordLink}
                />
              ))}
            </div>
          ))}
        </form>
      )
    }
    return (
      <form
        id="queue"
        class={['queue-class-grid grid grid-cols-1 gap-4 md:grid-cols-2', gridCols]}
        ws-send
        data-disable-when-offline
      >
        {config.classes
          .map(gc => gc.name)
          .map(gameClass => (
            <div class="queue-class-column">
              <h2 class="queue-class-heading">
                <GameClassIcon gameClass={gameClass} size={32} />
                <span>{gameClass}</span>
              </h2>
              {props.slots
                .filter(slot => slot.gameClass === gameClass)
                .map(slot => (
                  <SingleClassQueueSlot
                    queue={props.queue}
                    slot={slot}
                    actor={actor}
                    defaultSkill={defaultSkill}
                    requireDiscordLink={requireDiscordLink}
                  />
                ))}
            </div>
          ))}
      </form>
    )
  }
  const classSelectionHint = (
    <p class="queue-class-selection-hint">
      <strong>Click a class name</strong> to join as that class. Use <strong>Also available</strong>{' '}
      to mark other classes you can play.
    </p>
  )
  if (teams.length > 0) {
    const teamNames = ['BLU', 'RED'] as const

    return (
      <>
        {classSelectionHint}
        <form
          id="queue"
          class="queue-compact-grid"
          style={'--team-size: ' + positions.length.toString()}
          ws-send
          data-disable-when-offline
        >
          <input type="hidden" name="join" value="" disabled data-class-preferences-join />
          <div class="queue-team-heading-spacer" aria-hidden="true"></div>
          {positions.map((position, index) => (
            <ClassPreferences
              queue={props.queue}
              slots={props.slots}
              actor={actor}
              defaultSkill={defaultSkill}
              gameClass={position.gameClass}
              headingId={`queue-class-preference-${position.gameClass}-${position.classIndex}`}
              requireDiscordLink={requireDiscordLink}
              includeInForm={
                positions.findIndex(candidate => candidate.gameClass === position.gameClass) ===
                index
              }
            />
          ))}

          {teamNames.map((teamName, teamIndex) => (
            <div class="queue-team-row">
              <div
                class={[
                  'queue-team-summary',
                  teamName === 'BLU' ? 'queue-team-blu' : 'queue-team-red',
                ]}
              >
                <span>{teamName}</span>
                <TeamPlayerCount teamIndex={teamIndex} slots={teams[teamIndex] ?? []} />
              </div>
              {teams[teamIndex]?.map(slot => (
                <QueueSlot
                  queue={props.queue}
                  slot={slot}
                  allSlots={props.slots}
                  actor={actor}
                  defaultSkill={defaultSkill}
                />
              ))}
            </div>
          ))}
        </form>
      </>
    )
  }

  return (
    <>
      {classSelectionHint}
      <form
        id="queue"
        class={['queue-class-grid grid grid-cols-1 gap-4 md:grid-cols-2', gridCols]}
        ws-send
        data-disable-when-offline
      >
        <input type="hidden" name="join" value="" disabled data-class-preferences-join />
        {config.classes
          .map(gc => gc.name)
          .map(gameClass => (
            <div class="queue-class-column">
              <ClassPreferences
                queue={props.queue}
                slots={props.slots}
                actor={actor}
                defaultSkill={defaultSkill}
                gameClass={gameClass}
                requireDiscordLink={requireDiscordLink}
              />

              {props.slots
                .filter(slot => slot.gameClass === gameClass)
                .map(slot => (
                  <QueueSlot
                    queue={props.queue}
                    slot={slot}
                    allSlots={props.slots}
                    actor={actor}
                    defaultSkill={defaultSkill}
                  />
                ))}
            </div>
          ))}
      </form>
    </>
  )
}

export async function ClearQueueButton(props: {
  queue: Pick<QueueModel, 'slug'>
  actor?: User | undefined
}) {
  if (!props.actor?.player.roles.includes(PlayerRole.admin)) {
    return <></>
  }

  return (
    <button
      class="button queue-clear-button max-lg:flex-1 max-lg:px-3 max-lg:text-sm max-lg:whitespace-nowrap"
      data-variant="accent"
      data-umami-event="clear-queue"
      hx-delete={queues.queuePageUrl(props.queue.slug) + '/players'}
      hx-confirm="Are you sure you want to kick everyone from the queue?"
    >
      <span>Clear queue</span>
    </button>
  )
}
