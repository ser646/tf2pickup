import { mergeTests } from '@playwright/test'
import { authUsers } from '../fixtures/auth-users'
import { waitForEmptyQueue } from '../fixtures/wait-for-empty-queue'
import { expect } from '../fixtures/expect'
import type { QueuePage } from '../pages/queue.page'

const test = mergeTests(authUsers, waitForEmptyQueue)

test('moves flexible players when a class specialist joins @6v6', async ({ users }) => {
  const [flexible1, flexible2, medic] = users.getMany(3)
  const [flexible1Page, flexible2Page, medicPage] = (await Promise.all(
    [flexible1, flexible2, medic].map(async user => {
      const page = await user.queuePage()
      await page.goto()
      return page
    }),
  )) as [QueuePage, QueuePage, QueuePage]

  await expect(flexible1Page.page.locator('.queue-class-selection-hint')).toContainText(
    'Click a class name',
  )

  // Flexible players tick "Also available: Scout", then click Medic as their primary class.
  for (const page of [flexible1Page, flexible2Page]) {
    await page.page.locator('[data-class-preference][value="scout"]').first().check()
  }
  // Clicking the class name chooses the primary class and joins the queue.
  await flexible1Page.slot('medic-1').join()
  // A queue update from another player must not discard this unsaved local selection.
  await expect(
    flexible2Page.page.locator('[data-class-preference][value="scout"]').first(),
  ).toBeChecked()
  await flexible2Page.slot('medic-2').join()
  await medicPage.slot('medic-1').join()

  await expect(medicPage.slot('medic-1').locator).toHaveAttribute('data-player', medic.steamId)
  await expect.poll(async () => [
    await medicPage.slot('medic-2').locator.getAttribute('data-player'),
    await medicPage.slot('scout-1').locator.getAttribute('data-player'),
  ]).toEqual(expect.arrayContaining([flexible1.steamId, flexible2.steamId]))

  // Alternate availability is a hint for empty slots only, never content below a player.
  for (const slotId of ['medic-1', 'medic-2', 'scout-1'] as const) {
    await expect(medicPage.slot(slotId).locator.locator('.queue-slot-alternates')).toHaveCount(0)
  }
  await expect(medicPage.slot('scout-2').locator.locator('.queue-slot-alternates')).toHaveCount(1)

  await Promise.all([
    flexible1Page.leaveQueue(),
    flexible2Page.leaveQueue(),
    medicPage.leaveQueue(),
  ])
  await Promise.all([
    flexible1Page.waitToBeEmpty(),
    flexible2Page.waitToBeEmpty(),
    medicPage.waitToBeEmpty(),
  ])
})
