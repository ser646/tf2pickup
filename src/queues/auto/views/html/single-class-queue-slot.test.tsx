import { describe, expect, it } from 'vitest'
import { parse } from 'node-html-parser'
import { ObjectId } from 'mongodb'
import type { QueueSlotModel } from '../../../../database/models/queue-slot.model'
import type { QueueId } from '../../../../database/models/queue.model'
import { Gamemode } from '../../../../shared/types/gamemode'
import { Tf2ClassName } from '../../../../shared/types/tf2-class-name'
import { SingleClassQueueSlot } from './single-class-queue-slot'

describe('SingleClassQueueSlot', () => {
  it('uses the isolated legacy styling hook when multi-class is disabled', async () => {
    const html = parse(
      String(
        await SingleClassQueueSlot({
          queue: {
            enabled: true,
            skillThreshold: null,
            requireVerification: false,
            gamemode: Gamemode.sixes,
          },
          slot: {
            queue: new ObjectId() as QueueId,
            id: 'scout-1',
            gameClass: Tf2ClassName.scout,
            player: null,
            ready: false,
          } as QueueSlotModel,
          actor: undefined,
          defaultSkill: undefined,
        }),
      ),
    )

    expect(html.querySelector('.queue-slot.queue-slot-legacy')).not.toBeNull()
  })
})
