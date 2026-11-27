import { mergeTests } from '@playwright/test'
import { minutesToMilliseconds, secondsToMilliseconds } from 'date-fns'
import { launchGame } from '../fixtures/launch-game'
import { waitForEmptyQueue } from '../fixtures/wait-for-empty-queue'
import { expect } from '../fixtures/expect'
import { defaultQueueSlug } from '../queue-slots'

const test = mergeTests(launchGame, waitForEmptyQueue)
const readyUpTimeout = secondsToMilliseconds(20)

const key = 'queue.pre_ready_up_timeout'
let saved: string

test.beforeEach(async ({ users }) => {
  const admin = await users.getAdmin().adminPage()
  saved = await admin.configurationValue(key)
  await admin.configure(key, readyUpTimeout.toString())
})

test.afterEach(async ({ users }) => {
  const admin = await users.getAdmin().adminPage()
  await admin.configure(key, saved)
})

test('pre-ready up button is visible for logged-in-users @6v6 @9v9', async ({ users }) => {
  const page = await users.getNext().queuePage()
  await page.goto()
  await expect(page.preReadyUpButton).toBeVisible()
})

test('pre-ready up button is enabled when a player joins the queue @6v6 @9v9', async ({
  users,
}) => {
  const page = await users.getNext().queuePage()
  await page.goto()
  await expect(page.preReadyUpButton).toBeDisabled()
  await page.joinQueue('soldier-1')
  await expect(page.preReadyUpButton).toBeEnabled()
  await page.leaveQueue()
  await expect(page.preReadyUpButton).toBeDisabled()
})

test('pre-ready expires @6v6 @9v9', async ({ users }) => {
  const page = await users.getNext().queuePage()
  await page.goto()
  await page.joinQueue('soldier-1')
  await page.preReadyUpButton.click()
  await expect(page.preReadyUpButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.preReadyUpButton).toContainText(/\d+:\d+/)
  await expect(page.preReadyUpButton).not.toHaveAttribute('aria-pressed', 'true', {
    timeout: readyUpTimeout + secondsToMilliseconds(2),
  })
  await expect(page.preReadyUpButton).not.toContainText(/\d+:\d+/, {
    useInnerText: true,
  })
})

test('pre-ready up readies up when the queue is ready @6v6 @9v9', async ({
  users,
  players,
  desiredSlots,
}) => {
  const preReadiedPlayers = players.slice(0, -1)
  const lastPlayer = players[players.length - 1]!

  try {
    await Promise.all(
      preReadiedPlayers.map(async user => {
        const page = await user.queuePage()
        await page.goto()
        const slot = desiredSlots.get(user.playerName)!
        await page.slot(slot).join()
        await page.preReadyUp()
      }),
    )

    {
      const page = await lastPlayer.queuePage()
      await page.goto()
      const slot = desiredSlots.get(lastPlayer.playerName)!
      await page.slot(slot).join()
    }

    await Promise.all(
      players.map(async user => {
        const page = await user.page()
        await page.waitForURL(/games\/(\d+)/)
      }),
    )
  } finally {
    for (const user of players) {
      const matches = /games\/(\d+)/.exec((await user.page()).url())
      if (matches) {
        const gamePage = await users.getAdmin().gamePage(Number(matches[1]))
        await gamePage.goto()
        if (await gamePage.isLive()) {
          await gamePage.forceEnd()
        }
        break
      }
    }
  }
})

test('pre-ready up enables automatically after readying up @6v6 @9v9', async ({
  users,
  players,
  desiredSlots,
}) => {
  test.setTimeout(minutesToMilliseconds(2))
  const polemic = users.byName('Polemic')
  const shadowhunter = users.byName('Shadowhunter')

  await Promise.all(
    players
      .filter(p => p.playerName !== 'Polemic')
      .map(async user => {
        const page = await user.queuePage()
        await page.goto()
        const slot = desiredSlots.get(user.playerName)!
        await page.slot(slot).join()
      }),
  )

  const page = await polemic.queuePage()
  await page.goto()
  await page.slot(desiredSlots.get('Polemic')!).join()
  await expect(page.preReadyUpButton).toHaveAttribute('aria-pressed', 'true')

  {
    const page = await shadowhunter.queuePage()
    await page.readyUpDialog().readyUp()
    await expect(page.preReadyUpButton).toHaveAttribute('aria-pressed', 'true')
  }
})

async function setMultiClassEnabled(
  users: {
    getAdmin: () => { page: () => Promise<import('@playwright/test').Page> }
  },
  enabled: boolean,
) {
  const admin = await users.getAdmin().page()
  await admin.goto('/admin/queues/' + defaultQueueSlug())
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

test('does not ready up if switching classes as 11th player @6v6 @9v9', async ({
  users,
  players,
  desiredSlots,
}) => {
  await setMultiClassEnabled(users, true)
  const polemic = users.byName('Polemic')
  const firstSlot = desiredSlots.get('Polemic')!
  // BellBoy's slot is free, and Shadowhunter remains queued so Polemic is still the
  // 11th player in 6v6. Shadowhunter's slot is the same class as Polemic's in both modes.
  const secondSlot = desiredSlots.get('BellBoy')!

  await Promise.all(
    players
      .filter(p => p.playerName !== 'BellBoy')
      .filter(p => p.playerName !== 'Polemic')
      .map(async user => {
        const page = await user.queuePage()
        await page.goto()
        const slot = desiredSlots.get(user.playerName)!
        await page.slot(slot).join()
      }),
  )

  const page = await polemic.queuePage()
  await page.goto()
  await page.slot(firstSlot).join()

  // Clicking the second class heading changes the primary class without a separate
  // availability form or an explicit "Update availability" action.
  await page.slot(secondSlot).join()

  const reassignedSlot = page.slot(secondSlot)
  await expect(reassignedSlot.locator).toHaveAttribute('data-player', polemic.steamId)
  expect(await reassignedSlot.isReady()).toBe(false)
  await setMultiClassEnabled(users, false)
})
