import type { PlayerModel, PlayerSkill } from '../../../../database/models/player.model'
import type { QueueModel } from '../../../../database/models/queue.model'
import type { QueueSlotModel } from '../../../../database/models/queue-slot.model'
import { GameClassIcon } from '../../../../html/components/game-class-icon'
import { gamemodeConfigs } from '../../../../gamemodes/configs'
import { joinBlocker, type JoinBlockerPlayer } from '../../join-blocker'

type Actor = (JoinBlockerPlayer & Pick<PlayerModel, 'steamId' | 'roles'>) | undefined
type Queue = Pick<QueueModel, 'enabled' | 'requireVerification' | 'skillThreshold' | 'gamemode'>

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

  return (
    <div
      id="queue-class-preferences"
      class="queue-class-preferences"
      data-own-slot={ownSlot?.id}
      aria-label="Select the classes you can play"
    >
      <span class="queue-class-preferences-label">I can play:</span>
      <div class="queue-class-preferences-options">
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
              class={[
                'queue-class-preferences-option',
                checked && 'queue-class-preferences-option-selected',
                blocker && 'queue-class-preferences-option-disabled',
              ]}
              title={blocker ?? name}
            >
              <input
                type="checkbox"
                name="classes"
                value={name}
                checked={checked}
                disabled={!!blocker}
                data-class-preference
                aria-label={name}
              />
              <GameClassIcon gameClass={name} size={28} />
              <span>{name}</span>
            </label>
          )
        })}
      </div>
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
    </div>
  )
}
