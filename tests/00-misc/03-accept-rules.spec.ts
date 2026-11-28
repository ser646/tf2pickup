import { test } from '@playwright/test'
import { expect } from '../fixtures/expect'
import { users } from '../data'

const newcomer = users.find(({ name }) => name === 'Newcomer')!

test('accept rules @6v6 @9v9', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'default' })
  })
  await page.goto(`/auth/test?steamId=${newcomer.steamId}&acceptedRules=false`)
  const dialog = page.getByTitle('Accept rules dialog')
  await expect(dialog).toBeVisible()
  const rules = dialog.getByRole('region', { name: 'Rules' })
  await expect(dialog).toHaveJSProperty('scrollTop', 0)
  await expect(rules).toBeFocused()
  await expect(rules).toHaveJSProperty('scrollTop', 0)
  const banner = page.locator('#notifications-permission-default')
  await expect(banner).toBeVisible()
  const originalBanner = await banner.elementHandle()
  const queueUrl = page.url()

  const btn = page.getByRole('button', { name: 'I accept these rules' })
  await expect(btn).toBeVisible()
  await btn.click()

  await expect(dialog).not.toBeVisible()
  await expect(banner).toBeVisible()
  expect(await originalBanner.evaluate(element => element.isConnected)).toBe(true)
  expect(page.url()).toBe(queueUrl)
  expect(await page.evaluate(() => Notification.permission)).toBe('default')

  const skillDialog = page.locator('#skill-onboarding-dialog')
  if ((process.env.QUEUE_CONFIG ?? '6v6') === '6v6') {
    await expect(skillDialog).toBeVisible()
    await expect(skillDialog.getByRole('radio', { name: /Level 4/ })).toBeDisabled()
    await expect(skillDialog.getByRole('radio', { name: /Level 5/ })).toBeDisabled()
    await skillDialog.getByRole('radio', { name: /Level 1/ }).check()
    await skillDialog.getByRole('button', { name: 'Save skill' }).click()
    await expect(skillDialog).not.toBeVisible()
  } else {
    await expect(skillDialog).toHaveCount(0)
  }
  await expect(
    page.locator('button[name="join"]:not(:disabled), [data-class-primary]:not(:disabled)').first(),
  ).toBeEnabled()
  await page.reload()
  await expect(dialog).not.toBeVisible()
  expect(errors).toEqual([])
})
