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
  const eligible = classes.filter(
    ({ name }) =>
      !joinBlocker(props.actor!, { gameClass: name }, props.queue, props.defaultSkill),
  )
  const allSelected =
    eligible.length > 0 && eligible.every(({ name }) => selected.includes(name))

  return (
    <fieldset
      id="queue-class-preferences"
      class="col-span-full flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
    >
      <legend class="px-1 text-sm font-semibold text-zinc-200">Classes you can play</legend>
      <label class="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold">
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
              'flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm',
              blocker && !checked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
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
            <span safe>{name}</span>
          </label>
        )
      })}
      {ownSlot && (
        <button
          type="submit"
          name="join"
          value={ownSlot.id}
          class="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
          disabled={eligible.length === 0}
          data-umami-event="update-class-availability"
        >
          Update availability
        </button>
      )}
      <p class="basis-full text-xs text-zinc-500">
        Select every class you are comfortable playing. The queue will assign you to one of them
        based on the available players. With no selection, the class of the slot you click is used.
      </p>
    </fieldset>
  )
}
