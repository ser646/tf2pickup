import htmx from './htmx'

// htmx restores focus after its own swaps, but the ws extension swaps via oobSwap, which doesn't.
let focused: Element | null = null
let lastFocused: Element | null = null
let focusedQueueSlotId: string | undefined

document.addEventListener('focusin', event => {
  const target = event.target
  if (target instanceof HTMLElement && target !== document.body) {
    lastFocused = target
  }
})

htmx.on('htmx:wsBeforeMessage', () => {
  const active = document.activeElement
  focused = active && active !== document.body ? active : lastFocused

  const primaryButton = focused?.closest<HTMLElement>('[data-class-primary]')
  const queueSlot = focused?.closest<HTMLElement>('.queue-slot[id^="queue-slot-"]')
  focusedQueueSlotId =
    primaryButton?.dataset.classPrimaryJoin ??
    queueSlot?.id.replace(/^queue-slot-/, '')
})

htmx.on('htmx:wsAfterMessage', () => {
  const lost = focused
  focused = null
  if (!lost || lost.isConnected) {
    focusedQueueSlotId = undefined
    return
  }
  if (document.activeElement && document.activeElement !== document.body) {
    focusedQueueSlotId = undefined
    return
  }

  // A class heading becomes a Leave button after joining; that Leave button becomes
  // the class heading again after leaving. Restore focus to the matching control.
  if (focusedQueueSlotId) {
    const slotId = focusedQueueSlotId
    const slot = document.getElementById('queue-slot-' + slotId)
    const leaveButton = slot?.querySelector<HTMLElement>('.leave-queue-button')
    if (leaveButton) {
      leaveButton.focus()
      focusedQueueSlotId = undefined
      return
    }

    const classButton = document.querySelector<HTMLElement>(
      '[data-class-primary-join="' + CSS.escape(slotId) + '"]',
    )
    if (classButton) {
      classButton.focus()
      focusedQueueSlotId = undefined
      return
    }
  }
  focusedQueueSlotId = undefined

  for (let el: Element | null = lost; el; el = el.parentElement) {
    if (!el.id) continue
    const replacement = document.getElementById(el.id)
    if (!replacement) continue
    if (el === lost) {
      if (replacement instanceof HTMLElement) {
        replacement.focus()
      }
      return
    }
    const href = lost.getAttribute('href')
    const sameLink = href
      ? replacement.querySelector<HTMLElement>(`[href="${CSS.escape(href)}"]`)
      : null
    const match =
      sameLink ??
      replacement.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])') ??
      replacement.querySelector<HTMLElement>('a[href]')
    match?.focus()
    return
  }
})
