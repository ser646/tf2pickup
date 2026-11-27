import { errors, type Locator, type Page } from '@playwright/test'
import { minutesToMilliseconds, secondsToMilliseconds } from 'date-fns'
import { queueSlots, type SlotId } from '../queue-slots'
import { expect } from '../fixtures/expect'

class QueueSlot {
  readonly locator: Locator

  constructor(
    private readonly page: Page,
    private readonly slotId: SlotId,
  ) {
    this.locator = this.page.getByLabel(`Queue slot ${this.slotId}`)
  }

  async isTaken() {
    return (await this.locator.getAttribute('data-player')) !== null
  }

  async waitToBeFree(options?: { timeout?: number }) {
    await expect(this.locator).not.toHaveAttribute('data-player', {
      timeout: options?.timeout ?? minutesToMilliseconds(1),
    })
  }

  async isReady() {
    return (await this.locator.locator('.player-info').getAttribute('data-player-ready')) === 'true'
  }

  joinButton() {
    const gameClass = this.slotId.slice(0, this.slotId.lastIndexOf('-'))
    // Some gamemodes render the same class heading once per slot. The controls are
    // intentionally class-based, so expose one representative visible heading.
    return this.page
      .locator(`[data-class-primary][data-class-primary-join^="${gameClass}-"]`)
      .filter({ visible: true })
      .first()
  }

  async join() {
    const primaryClassButtons = this.joinButton()
    if (await primaryClassButtons.count()) {
      // Current queue UI: clicking the class heading selects the primary class.
      await primaryClassButtons.click()
    } else {
      // Current single-class UI has a submit button; older upgrade fixtures use the slot itself.
      const legacyJoinButton = this.locator.locator('button[name="join"]')
      if (await legacyJoinButton.count()) {
        await legacyJoinButton.click()
        await expect(legacyJoinButton).not.toBeVisible()
      } else {
        await this.locator.click()
        await expect(this.locator).toHaveAttribute('data-player', /.+/)
      }
      return
    }
    const leaveQueueButton = this.page.getByRole('button', { name: 'Leave queue' })
    await expect
      .poll(async () => {
        const onGamePage = /games\/(\d+)/.test(this.page.url())
        const canLeaveQueue = await leaveQueueButton.isVisible()
        return onGamePage || canLeaveQueue
      })
      .toBe(true)
  }

  markAsFriendButton() {
    return this.locator.getByLabel('Mark as friend')
  }
}

class ReadyUpDialog {
  constructor(private readonly page: Page) {}

  readyUpButton() {
    return this.page.getByRole('button', { name: `I'M READY` })
  }

  async readyUp() {
    const button = this.readyUpButton()
    await expect(button).toBeVisible({ timeout: secondsToMilliseconds(15) })
    await button.click()
  }

  notReadyButton() {
    return this.page.getByRole('button', { name: `Can't play right now` })
  }

  async notReady() {
    const button = this.notReadyButton()
    try {
      await button.click({ timeout: secondsToMilliseconds(5) })
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return
      }
    }
  }
}

export class QueuePage {
  // without a slug, the default queue served at `/`
  constructor(
    public readonly page: Page,
    public readonly slug?: string,
  ) {}

  async goto() {
    await this.page.goto(this.slug ? `/q/${this.slug}` : '/')
  }

  async joinQueue(slot: SlotId) {
    await this.slot(slot).join()
  }

  async leaveQueue(timeout = secondsToMilliseconds(5)) {
    await this.page.getByRole('button', { name: 'Leave queue' }).click({ timeout })
  }

  async clearQueue() {
    this.page.once('dialog', dialog => dialog.accept())
    await Promise.all([
      this.page.waitForResponse(
        response =>
          response.url().endsWith('/players') &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
      ),
      this.page.getByRole('button', { name: 'Clear queue' }).click(),
    ])
    await this.waitToBeEmpty()
  }

  header() {
    return this.page.getByRole('heading', { name: /Players \d+\/\d+/ })
  }

  slot(slot: SlotId) {
    return new QueueSlot(this.page, slot)
  }

  queueSlot(slot: number) {
    return this.page.getByLabel(`Queue slot ${slot}`, { exact: true })
  }

  voteForMapButton(mapNo: number) {
    return this.page.getByLabel('Vote for map').locator(`nth=${mapNo}`)
  }

  readyUpDialog() {
    return new ReadyUpDialog(this.page)
  }

  async readyUp(slot: SlotId, playerId?: string) {
    const isPlayerReady = async () => {
      if (playerId) {
        const playerInfo = this.page.locator(`[data-player="${playerId}"] .player-info`)
        return (await playerInfo.getAttribute('data-player-ready')) === 'true'
      }
      return await this.slot(slot).isReady()
    }

    if (/games\/(\d+)/.test(this.page.url()) || (await isPlayerReady())) {
      return
    }
    const readyUpButton = this.readyUpDialog().readyUpButton()
    await expect
      .poll(
        async () => {
          if (/games\/(\d+)/.test(this.page.url())) {
            return 'game'
          }
          if (await isPlayerReady()) {
            return 'ready'
          }
          if (await readyUpButton.isVisible()) {
            return 'dialog'
          }
          return 'waiting'
        },
        { timeout: secondsToMilliseconds(15) },
      )
      .not.toBe('waiting')

    if (/games\/(\d+)/.test(this.page.url()) || (await isPlayerReady())) {
      return
    }
    await readyUpButton.click()
  }

  gamesLink() {
    return this.page.getByRole('link', { name: 'Games' })
  }

  banAlert() {
    return this.page.getByText('You are banned')
  }

  goBackToGameLink() {
    return this.page.getByRole('link', { name: 'Go back to the game' })
  }

  get preReadyUpButton() {
    return this.page.getByRole('button', { name: 'Pre-ready up' })
  }

  async preReadyUp() {
    await expect(this.preReadyUpButton).not.toHaveAttribute('aria-pressed', 'true')
    await this.preReadyUpButton.click({ noWaitAfter: true })
    await expect(this.preReadyUpButton).toHaveAttribute('aria-pressed', 'true')
  }

  async waitToBeEmpty(options?: { timeout?: number }) {
    await Promise.all(
      Array.from(queueSlots()).map(async i => {
        await this.slot(i).waitToBeFree(options)
      }),
    )
  }
}
