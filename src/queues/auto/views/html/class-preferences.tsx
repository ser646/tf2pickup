import type { PlayerModel, PlayerSkill } from '../../../../database/models/player.model'
import type { QueueModel } from '../../../../database/models/queue.model'
import type { QueueSlotModel } from '../../../../database/models/queue-slot.model'
import { GameClassIcon } from '../../../../html/components/game-class-icon'
import { gamemodeConfigs } from '../../../../gamemodes/configs'
import { joinBlocker, type JoinBlockerPlayer } from '../../join-blocker'

type Actor = (JoinBlockerPlayer & Pick<PlayerModel, 'steamId' | 'roles'>) | undefined
type Queue = Pick<
  QueueModel,
  'enabled' | 'requireVerification' | 'skillThreshold' | 'gamemode'
>

export function ClassPreferences(props: {
  queue: Queue
  slots: QueueSlotModel[]
  actor: Actor
  defaultSkill: PlayerSkill | undefined
}) {
  if (!props.actor) {
    return <></>
  }

  const classes = gamemodeConfigs[props.queue.gamemode].classes
  const ownSlot = props.slots.find(slot => slot.player?.steamId === props.actor?.steamId)
  const selected = ownSlot?.availableClasses ?? (ownSlot ? [ownSlot.gameClass] : [])
  const eligible = classes.filter(
    ({ name }) =>
      !joinBlocker(props.actor!, { gameClass: name }, props.queue, props.defaultSkill),
  )
  const allSelected =
    eligible.length > 0 && eligible.every(({ name }) => selected.includes(name))

  return (
    <fieldset id="queue-class-preferences" class="queue-class-preferences">
      <legend>Classes you can play</legend>
      <label class="queue-class-preferences-option queue-class-preferences-option-all">
        <input
          type="checkbox"
          data-select-all-classes
          checked={allSelected}
          disabled={eligible.length === 0}
        />
        All available classes
      </label>
      {classes.map(({ name }) => {
        const blocker = joinBlocker(
          props.actor!,
          { gameClass: name },
          props.queue,
          props.defaultSkill,
        )
        const checked = selected.includes(name)
        return (
          <label
            title={blocker ?? undefined}
            class={[
              'queue-class-preferences-option',
              blocker && !checked && 'queue-class-preferences-option-disabled',
            ]}
          >
            <input
              type="checkbox"
              name="classes"
              value={name}
              checked={checked}
              disabled={!!blocker && !checked}
              data-class-preference
            />
            <GameClassIcon gameClass={name} size={20} />
            <span>{name}</span>
          </label>
        )
      })}
      {ownSlot === undefined ? null : (
        <button
          type="submit"
          name="join"
          value={ownSlot.id}
          class="queue-class-preferences-update"
          disabled={eligible.length === 0}
          data-umami-event="update-class-availability"
        >
          Update availability
        </button>
      )}
      <p class="queue-class-preferences-help">
        Select every class you are comfortable playing. The queue will assign you to one of them
        based on the available players. With no selection, the class of the slot you click is used.
      </p>
    </fieldset>
  )
}
