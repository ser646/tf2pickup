import { describe, expect, it } from 'vitest'
import { parse } from 'node-html-parser'
import { ObjectId } from 'mongodb'
import type { QueueSlotModel } from '../../../../database/models/queue-slot.model'
import type { QueueId } from '../../../../database/models/queue.model'
import type { SteamId64 } from '../../../../shared/types/steam-id-64'
import { Gamemode } from '../../../../shared/types/gamemode'
import { Tf2ClassName } from '../../../../shared/types/tf2-class-name'
import { ClassPreferences } from './class-preferences'

const steamId = '76561198000000001' as SteamId64
const queue = {
  enabled: true,
  requireVerification: false,
  skillThreshold: null,
  gamemode: Gamemode.sixes,
}
const actor = {
  steamId,
  hasAcceptedRules: true,
  bans: [],
  activeGame: undefined,
  verified: true,
  skill: undefined,
}

describe('ClassPreferences', () => {
  it('shows the all-classes shortcut and one checkbox per class in the gamemode', () => {
    const html = parse(
      String(
        ClassPreferences({
          queue,
          slots: [],
          actor: actor as never,
          defaultSkill: undefined,
        }),
      ),
    )

    expect(html.querySelector('[data-select-all-classes]')).not.toBeNull()
    expect(html.querySelectorAll('input[name="classes"]')).toHaveLength(4)
    expect(html.text).toContain('Select every class you are comfortable playing')
  })

  it('preselects the classes saved for the current queue membership', () => {
    const slot = {
      queue: new ObjectId() as QueueId,
      id: 'soldier-1',
      gameClass: Tf2ClassName.soldier,
      availableClasses: [Tf2ClassName.scout, Tf2ClassName.soldier],
      player: { steamId, name: 'player', avatarUrl: '' },
      ready: false,
    } as QueueSlotModel
    const html = parse(
      String(
        ClassPreferences({
          queue,
          slots: [slot],
          actor: actor as never,
          defaultSkill: undefined,
        }),
      ),
    )

    const checked = html
      .querySelectorAll('input[name="classes"][checked]')
      .map(input => input.getAttribute('value'))
    expect(checked).toEqual([Tf2ClassName.scout, Tf2ClassName.soldier])
    expect(html.querySelector('button[name="join"][value="soldier-1"]')?.text).toContain(
      'Update availability',
    )
  })
})
