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

  // Clicking a class heading joins the queue; no individual slot is clicked.
  await flexible1Page.slot('medic-1').join()
  await flexible2Page.slot('medic-2').join()
  await medicPage.slot('medic-1').join()

  await expect(medicPage.slot('medic-1').locator).toHaveAttribute('data-player', medic.steamId)
  await expect.poll(async () => [
    await medicPage.slot('medic-2').locator.getAttribute('data-player'),
    await medicPage.slot('scout-1').locator.getAttribute('data-player'),
  ]).toEqual(expect.arrayContaining([flexible1.steamId, flexible2.steamId]))

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
