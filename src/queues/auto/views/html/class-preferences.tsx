import type { PlayerModel, PlayerSkill } from '../../../../database/models/player.model'
import type { QueueModel } from '../../../../database/models/queue.model'
import type { QueueSlotModel } from '../../../../database/models/queue-slot.model'
import { GameClassIcon } from '../../../../html/components/game-class-icon'
import { gamemodeConfigs } from '../../../../gamemodes/configs'
import type { Tf2ClassName } from '../../../../shared/types/tf2-class-name'
import { joinBlocker, type JoinBlockerPlayer } from '../../join-blocker'

type Actor = (JoinBlockerPlayer & Pick<PlayerModel, 'steamId' | 'roles'>) | undefined
type Queue = Pick<QueueModel, 'enabled' | 'requireVerification' | 'skillThreshold' | 'gamemode'>

export function ClassPreferences(props: {
  queue: Queue
  slots: QueueSlotModel[]
  actor: Actor
  defaultSkill: PlayerSkill | undefined
  gameClass: Tf2ClassName
}) {
  const gameClass = gamemodeConfigs[props.queue.gamemode].classes.find(
    gameClass => gameClass.name === props.gameClass,
  )
  if (!props.actor || !gameClass) {
    return (
      <h2 id={'queue-class-preference-' + props.gameClass} class="queue-class-heading">
        <GameClassIcon gameClass={props.gameClass} size={32} />
        <span>{props.gameClass}</span>
      </h2>
    )
  }

  const ownSlot = props.slots.find(slot => slot.player?.steamId === props.actor?.steamId)
  const selected = ownSlot?.availableClasses ?? (ownSlot ? [ownSlot.gameClass] : [])
  const blocker = joinBlocker(
    props.actor,
    { gameClass: props.gameClass },
    props.queue,
    props.defaultSkill,
  )
  const checked = selected.includes(props.gameClass)

  return (
    <label
      id={'queue-class-preference-' + props.gameClass}
      class={[
        'queue-class-heading',
        'queue-class-preference-' + props.gameClass,
        'queue-class-heading-selectable',
        checked && 'queue-class-heading-selected',
        blocker && 'queue-class-heading-disabled',
      ]}
      title={blocker ?? ('Toggle ' + props.gameClass + ' availability')}
    >
      <input
        type="checkbox"
        name="classes"
        value={props.gameClass}
        checked={checked}
        disabled={!!blocker}
        data-class-preference
        aria-label={'I can play ' + props.gameClass}
      />
      <GameClassIcon gameClass={props.gameClass} size={32} />
      <span>{props.gameClass}</span>
      {ownSlot ? (
        <button
          type="submit"
          name="join"
          value={ownSlot.id}
          class="queue-class-preferences-submit"
          data-class-preferences-submit
          tabindex={-1}
          aria-hidden="true"
        />
      ) : null}
    </label>
  )
}
