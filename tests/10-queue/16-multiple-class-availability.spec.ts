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

  const selectClasses = async (queuePage: QueuePage, classes: string[]) => {
    for (const gameClass of classes) {
      await queuePage.page
        .locator(`#queue-class-preferences input[value="${gameClass}"]`)
        .check()
    }
  }

  // Both flexible players initially occupy the two medic slots.
  await selectClasses(flexible1Page, ['scout', 'medic'])
  await flexible1Page.slot('medic-1').join()
  await selectClasses(flexible2Page, ['scout', 'medic'])
  await flexible2Page.slot('medic-2').join()

  // A medic specialist joins through another free slot. The matcher must move one
  // flexible player to scout rather than reject the specialist or overfill medic.
  await selectClasses(medicPage, ['medic'])
  await medicPage.slot('scout-1').join()

  await expect(medicPage.slot('medic-1').locator).toHaveAttribute('data-player', medic.steamId)
  await expect(flexible1Page.slot('medic-2').locator).toHaveAttribute(
    'data-player',
    flexible1.steamId,
  )
  await expect(flexible2Page.slot('scout-1').locator).toHaveAttribute(
    'data-player',
    flexible2.steamId,
  )

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
