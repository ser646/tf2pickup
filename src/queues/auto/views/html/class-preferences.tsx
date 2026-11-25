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
  headingId?: string
  includeInForm?: boolean
}) {
  const classConfig = gamemodeConfigs[props.queue.gamemode].classes.find(
    item => item.name === props.gameClass,
  )
  if (!props.actor || !classConfig) {
    return (
      <h2
        id={props.headingId ?? 'queue-class-preference-' + props.gameClass}
        class="queue-class-heading"
      >
        <GameClassIcon gameClass={props.gameClass} size={32} />
        <span>{props.gameClass}</span>
      </h2>
    )
  }

  const ownSlot = props.slots.find(slot => slot.player?.steamId === props.actor?.steamId)
  const primarySlot =
    (ownSlot?.gameClass === props.gameClass ? ownSlot : undefined) ??
    props.slots.find(slot => slot.gameClass === props.gameClass && !slot.player) ??
    props.slots.find(slot => slot.gameClass === props.gameClass)
  const selected = ownSlot?.availableClasses ?? (ownSlot ? [ownSlot.gameClass] : [])
  const isPrimary = ownSlot?.gameClass === props.gameClass
  const blocker = joinBlocker(
    props.actor,
    { gameClass: props.gameClass },
    props.queue,
    props.defaultSkill,
  )
  const checked = !isPrimary && selected.includes(props.gameClass)

  return (
    <div
      id={props.headingId ?? 'queue-class-preference-' + props.gameClass}
      class={[
        'queue-class-heading',
        'queue-class-heading-selectable',
        isPrimary && 'queue-class-heading-primary',
        checked && 'queue-class-heading-selected',
        blocker && 'queue-class-heading-disabled',
      ]}
    >
      <button
        type="button"
        class="queue-class-primary-button"
        data-class-primary
        data-class-primary-join={primarySlot?.id}
        disabled={!!blocker || !primarySlot}
        title={blocker ?? ('Select ' + props.gameClass + ' as your main class')}
      >
        <GameClassIcon gameClass={props.gameClass} size={32} />
        <span>{props.gameClass}</span>
      </button>
      <label class="queue-class-also-available" title={'Also available: ' + props.gameClass}>
        <input
          type="checkbox"
          {...(props.includeInForm === false ? {} : { name: 'classes' })}
          value={props.gameClass}
          checked={checked}
          disabled={!!blocker || isPrimary}
          data-class-preference
          data-class-preference-join={ownSlot?.id}
          aria-label={'Also available: ' + props.gameClass}
        />
        <span>Also available</span>
      </label>
    </div>
  )
}
