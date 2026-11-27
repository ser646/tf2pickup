import { mergeTests } from '@playwright/test'
import { secondsToMilliseconds } from 'date-fns'
import { authUsers } from '../fixtures/auth-users'
import { waitForEmptyQueue } from '../fixtures/wait-for-empty-queue'
import { expect } from '../fixtures/expect'

const test = mergeTests(authUsers, waitForEmptyQueue)

test('keeps keyboard focus on the slot after joining and leaving @6v6 @9v9', async ({ users }) => {
  const { page } = await users.getNext().queuePage()
  await page.goto('/')

  // Multi-class is opt-in. By default, keyboard signup must use the original
  // per-slot join control and restore focus to that control after leaving.
  const joinButton = page.locator('[aria-label="Queue slot soldier-1"] button[name="join"]')
  await expect(joinButton).toBeVisible()
  await joinButton.focus()
  await page.keyboard.press('Enter')
  const leaveButton = page.locator('[aria-label="Queue slot soldier-1"] button[name="leave"]')
  await expect(leaveButton).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(joinButton).toBeFocused()
})

test('keeps focus on an online player link when the list re-renders @6v6 @9v9', async ({
  users,
}) => {
  const [watcher, newcomer] = users.getMany(2)
  const queuePage = await watcher.queuePage()
  await queuePage.goto()
  await queuePage.page.getByRole('button', { name: /Online/ }).click()

  const onlinePlayerList = queuePage.page.locator('#online-player-list')
  const newcomerLink = onlinePlayerList.getByRole('link', {
    name: newcomer.playerName,
    exact: true,
  })
  await expect(newcomerLink).not.toBeVisible({ timeout: secondsToMilliseconds(14) })

  const ownLink = onlinePlayerList.getByRole('link', { name: watcher.playerName, exact: true })
  await ownLink.focus()

  await (await newcomer.queuePage()).goto()
  await expect(newcomerLink).toBeVisible()
  await expect(ownLink).toBeFocused()
})
