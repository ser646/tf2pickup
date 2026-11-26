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
  roles: [],
}

describe('ClassPreferences', () => {
  it('renders a primary class control and an also-available checkbox', () => {
    const html = parse(
      String(
        ClassPreferences({
          queue,
          slots: [],
          actor: actor as never,
          defaultSkill: undefined,
          gameClass: Tf2ClassName.scout,
        }),
      ),
    )

    expect(html.querySelector('#queue-class-preference-scout')).not.toBeNull()
    const availabilityCheckbox = html.querySelector('input[name="classes"][value="scout"]')
    expect(availabilityCheckbox).not.toBeNull()
    expect(availabilityCheckbox!.getAttribute('disabled')).toBeDefined()
    expect(html.querySelector('button[data-class-primary]')).not.toBeNull()
    expect(html.text).toContain('Also available')
    expect(html.text).toContain('scout')
    expect(html.querySelector('#queue-class-preferences')).toBeNull()
    expect(html.querySelector('[data-select-all-classes]')).toBeNull()
  })

  it('provides the join slot as a data value for a class before the player has joined', () => {
    const slots = [
      {
        queue: new ObjectId() as QueueId,
        id: 'scout-1',
        gameClass: Tf2ClassName.scout,
        player: null,
        ready: false,
      },
    ] as QueueSlotModel[]
    const html = parse(
      String(
        ClassPreferences({
          queue,
          slots,
          actor: actor as never,
          defaultSkill: undefined,
          gameClass: Tf2ClassName.scout,
        }),
      ),
    )

    expect(
      html.querySelector('button[data-class-primary-join="scout-1"]'),
    ).not.toBeNull()
  })

  it('allows availability for a class whose slots are all occupied', () => {
    const slots = [
      {
        queue: new ObjectId() as QueueId,
        id: 'scout-1',
        gameClass: Tf2ClassName.scout,
        player: { steamId: '76561198000000002' as SteamId64, name: 'Other', avatarUrl: '' },
        ready: false,
      },
    ] as QueueSlotModel[]
    const html = parse(
      String(
        ClassPreferences({
          queue,
          slots,
          actor: actor as never,
          defaultSkill: undefined,
          gameClass: Tf2ClassName.scout,
        }),
      ),
    )

    expect(html.querySelector('button[data-class-primary-join="scout-1"]')).not.toBeNull()
    expect(html.querySelector('input[name="classes"][value="scout"][disabled]')).toBeNull()
  })

  it('reflects saved availability and uses the existing slot for updates', () => {
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
          slots: [
            slot,
            {
              queue: slot.queue,
              id: 'scout-1',
              gameClass: Tf2ClassName.scout,
              player: null,
              ready: false,
            },
          ],
          actor: actor as never,
          defaultSkill: undefined,
          gameClass: Tf2ClassName.scout,
        }),
      ),
    )

    expect(html.querySelector('input[name="classes"][value="scout"][checked]')).not.toBeNull()
    expect(html.querySelector('button[data-class-primary-join="scout-1"]')).not.toBeNull()
    expect(
      html.querySelector('input[data-class-preference-join="soldier-1"][value="scout"]'),
    ).not.toBeNull()
    expect(html.querySelector('input[value="soldier"][disabled]')).not.toBeNull()
  })

  it('renders the original heading unchanged for signed-out viewers', () => {
    const html = parse(
      String(
        ClassPreferences({
          queue,
          slots: [],
          actor: undefined,
          defaultSkill: undefined,
          gameClass: Tf2ClassName.scout,
        }),
      ),
    )

    expect(html.querySelector('h2#queue-class-preference-scout')).not.toBeNull()
    expect(html.querySelector('input[name="classes"]')).toBeNull()
    expect(html.text).toContain('scout')
  })
})
