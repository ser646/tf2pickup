import { mergeTests } from '@playwright/test'
import { authUsers } from '../fixtures/auth-users'
import { waitForEmptyQueue } from '../fixtures/wait-for-empty-queue'
import { expect } from '../fixtures/expect'
import type { QueuePage } from '../pages/queue.page'
import { defaultQueueSlug } from '../queue-slots'

const test = mergeTests(authUsers, waitForEmptyQueue)

async function setMultiClassEnabled(
  users: {
    getAdmin: () => { page: () => Promise<import('@playwright/test').Page> }
  },
  enabled: boolean,
) {
  const admin = await users.getAdmin().page()
  await admin.goto(`/admin/queues/${defaultQueueSlug()}`)
  const toggle = admin.locator('label.switch').filter({
    has: admin.locator('#allowMultipleClasses'),
  })
  const checkbox = admin.locator('#allowMultipleClasses')
  if ((await checkbox.isChecked()) !== enabled) {
    // The checkbox is visually covered by the custom switch slider. Click the
    // slider itself so the native label activation toggles the real checkbox.
    await toggle.locator('.slider').click()
  }
  if (enabled) {
    await expect(checkbox).toBeChecked()
  } else {
    await expect(checkbox).not.toBeChecked()
  }
  await admin.getByRole('button', { name: 'Save' }).click()
  await expect(admin.getByText('Configuration saved')).toBeVisible()
}

test.afterEach(async ({ users }) => {
  await setMultiClassEnabled(users, false)
})

test('preserves the original click-a-slot signup by default @6v6', async ({ users }) => {
  await setMultiClassEnabled(users, false)
  const player = users.getNext(user => !user.isAdmin)
  const page = await player.queuePage()
  await page.goto()

  await expect(page.page.locator('.queue-class-selection-hint')).toHaveCount(0)
  await expect(page.page.locator('[data-class-preference]')).toHaveCount(0)
  await expect(page.slot('scout-1').joinButton()).toBeVisible()
  await page.slot('scout-1').join()
  await expect(page.slot('scout-1').locator).toHaveAttribute('data-player', player.steamId)
  await page.leaveQueue()
  await page.waitToBeEmpty()
})

test('moves flexible players when a class specialist joins @6v6', async ({ users }) => {
  await setMultiClassEnabled(users, true)
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

  // Alternate classes cannot be selected before the player has joined a slot.
  for (const page of [flexible1Page, flexible2Page]) {
    await expect(page.page.locator('[data-class-preference][value="scout"]').first()).toBeDisabled()
  }

  // Join as Medic first; only then can the player opt into Scout as an alternate class.
  await flexible1Page.slot('medic-1').join()
  await expect(
    flexible1Page.page.locator('[data-class-preference][value="scout"]').first(),
  ).toBeEnabled()
  await flexible1Page.page.locator('[data-class-preference][value="scout"]').first().check()

  await flexible2Page.slot('medic-2').join()
  await expect(
    flexible2Page.page.locator('[data-class-preference][value="scout"]').first(),
  ).toBeEnabled()
  await flexible2Page.page.locator('[data-class-preference][value="scout"]').first().check()

  // A queue update from another player must not discard an existing alternate selection.
  await medicPage.slot('medic-1').join()
  await expect(
    flexible2Page.page.locator('[data-class-preference][value="scout"]').first(),
  ).toBeChecked()

  // 6v6 has four Scout slots across both teams. The flexible assignment may use any of them.
  const readAssignment = async () => ({
    medic: await Promise.all(
      (['medic-1', 'medic-2'] as const).map(slotId =>
        medicPage.slot(slotId).locator.getAttribute('data-player'),
      ),
    ),
    scout: await Promise.all(
      (['scout-1', 'scout-2', 'scout-3', 'scout-4'] as const).map(slotId =>
        medicPage.slot(slotId).locator.getAttribute('data-player'),
      ),
    ),
  })
  await expect
    .poll(async () => {
      const assignment = await readAssignment()
      const flexibleIds = [flexible1.steamId, flexible2.steamId]
      return {
        hasMedicSpecialist: assignment.medic.includes(medic.steamId),
        flexiblePlayersInMedic: assignment.medic.filter(id =>
          flexibleIds.some(flexibleId => flexibleId === id),
        ).length,
        flexiblePlayersInScout: assignment.scout.filter(id =>
          flexibleIds.some(flexibleId => flexibleId === id),
        ).length,
      }
    })
    .toEqual({
      hasMedicSpecialist: true,
      flexiblePlayersInMedic: 1,
      flexiblePlayersInScout: 1,
    })

  const assignment = await readAssignment()
  expect(
    assignment.medic.filter(id =>
      [flexible1.steamId, flexible2.steamId].some(flexibleId => flexibleId === id),
    ),
  ).toHaveLength(1)
  expect(
    assignment.scout.filter(id =>
      [flexible1.steamId, flexible2.steamId].some(flexibleId => flexibleId === id),
    ),
  ).toHaveLength(1)

  // Alternate availability is a hint for empty slots only, never content below a player.
  for (const slotId of [
    'medic-1',
    'medic-2',
    'scout-1',
    'scout-2',
    'scout-3',
    'scout-4',
  ] as const) {
    const slot = medicPage.slot(slotId).locator
    if (await slot.getAttribute('data-player')) {
      await expect(slot.locator('.queue-slot-alternates')).toHaveCount(0)
    } else {
      await expect(slot.locator('.queue-slot-alternates')).toHaveCount(1)
    }
  }

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
