import { test } from '@playwright/test'
import { MongoClient } from 'mongodb'
import { expect } from '../fixtures/expect'
import { users } from '../data'

const newcomer = users.find(({ name }) => name === 'Newcomer')!

async function setSkillOnboardingEnabled(enabled: boolean) {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to configure skill onboarding for this test')
  }

  const client = new MongoClient(process.env.MONGODB_URI)
  try {
    await client.connect()
    const configuration = client.db().collection('configuration')
    if (enabled) {
      await configuration.updateOne(
        { key: 'players.skill_onboarding_enabled' },
        { $set: { value: true } },
        { upsert: true },
      )
    } else {
      await configuration.deleteOne({ key: 'players.skill_onboarding_enabled' })
    }
  } finally {
    await client.close()
  }
}

test.beforeEach(async () => {
  await setSkillOnboardingEnabled(true)
})

test.afterEach(async () => {
  await setSkillOnboardingEnabled(false)
})

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
    await expect(
      skillDialog.getByRole('heading', { name: 'Choose your 6v6 class skills' }),
    ).toBeVisible()

    const scout = skillDialog.getByRole('group', { name: 'Scout' })
    const soldier = skillDialog.getByRole('group', { name: 'Soldier' })
    const demoman = skillDialog.getByRole('group', { name: 'Demoman' })
    const medic = skillDialog.getByRole('group', { name: 'Medic' })
    for (const classGroup of [scout, soldier, demoman, medic]) {
      await expect(classGroup).toBeVisible()
      await expect(classGroup.getByRole('radio', { name: 'Experienced' })).toBeDisabled()
      await expect(classGroup.getByRole('radio', { name: 'Advanced' })).toBeDisabled()
    }

    const bypass = await page.request.post('/players/' + newcomer.steamId + '/skill-onboarding', {
      form: {
        skill_scout: '4',
        skill_soldier: '1',
        skill_demoman: '1',
        skill_medic: '1',
      },
    })
    expect(bypass.status()).toBe(403)

    await scout.getByRole('radio', { name: 'Beginner' }).check({ force: true })
    await soldier.getByRole('radio', { name: 'Familiar' }).check({ force: true })
    await demoman.getByRole('radio', { name: 'Newbie' }).check({ force: true })
    await medic.getByRole('radio', { name: 'Beginner' }).check({ force: true })
    await skillDialog.getByRole('button', { name: 'Save class skills' }).click()
    await expect(skillDialog).not.toBeVisible()

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required to verify saved class skills')
    }
    const client = new MongoClient(process.env.MONGODB_URI)
    try {
      await client.connect()
      const savedPlayer = (await client
        .db()
        .collection('players')
        .findOne(
          { steamId: newcomer.steamId },
          { projection: { 'skill.6v6': 1, skillOnboardingCompletedAt: 1 } },
        )) as unknown as {
        skill?: { '6v6'?: Record<string, number> }
        skillOnboardingCompletedAt?: Date
      } | null
      expect(savedPlayer?.skill?.['6v6']).toEqual({
        scout: 2,
        soldier: 3,
        demoman: 1,
        medic: 2,
      })
      expect(savedPlayer?.skillOnboardingCompletedAt).toBeTruthy()
    } finally {
      await client.close()
    }
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
