import { SlotStatus } from '../../../database/models/game-slot.model'
import { configuration } from '../../../configuration'
import { VoiceServerType } from '../../../shared/types/voice-server-type'
import type { GameModel } from '../../../database/models/game.model'
import { IconHeadset } from '../../../html/components/icons'
import { isVerificationEnabled } from '../../../mumble/is-verification-enabled'
import { players } from '../../../players'
import type { SteamId64 } from '../../../shared/types/steam-id-64'

export async function JoinVoiceButton(props: {
  game: Pick<GameModel, 'number' | 'state' | 'slots'>
  actor: SteamId64 | undefined
}) {
  return (
    <div class="contents" id={`game-${props.game.number}-join-voice-button`}>
      <JoinVoiceButtonContent {...props} />
    </div>
  )
}

async function JoinVoiceButtonContent(props: {
  game: Pick<GameModel, 'number' | 'state' | 'slots'>
  actor: SteamId64 | undefined
}) {
  if (!props.actor) {
    return <></>
  }

  const slot = getPlayerSlot(props.game, props.actor)
  if (!slot) {
    return <></>
  }

  if (!slot.voiceServerUrl) {
    return <></>
  }

  const [player, voiceServerType] = await Promise.all([
    players.bySteamId(props.actor, ['mumbleCertificate', 'discordLink']),
    configuration.get('games.voice_server_type'),
  ])

  if (voiceServerType === VoiceServerType.discord && !player.discordLink) {
    return (
      <a
        href="/discord/link"
        class="button"
        data-umami-event="link-discord"
        data-umami-event-game-number={props.game.number}
      >
        <IconHeadset size={24} />
        link Discord
      </a>
    )
  }

  const needsVerification =
    voiceServerType === VoiceServerType.mumble &&
    !player.mumbleCertificate &&
    (await isVerificationEnabled())

  return (
    <>
      <a
        href={slot.voiceServerUrl}
        class="button"
        hx-boost="false"
        data-umami-event="join-voice"
        data-umami-event-game-number={props.game.number}
        data-umami-event-game-state={props.game.state}
      >
        <IconHeadset size={24} />
        join voice
      </a>
      {needsVerification && (
        <a
          href="/mumble"
          class="text-center text-sm underline"
          data-umami-event="mumble-verification-hint"
        >
          Mumble not verified, set up
        </a>
      )}
    </>
  )
}

function getPlayerSlot(game: Pick<GameModel, 'slots'>, actor?: SteamId64) {
  if (!actor) {
    return undefined
  }

  return game.slots
    .filter(slot => [SlotStatus.active, SlotStatus.waitingForSubstitute].includes(slot.status))
    .find(({ player }) => player === actor)
}
