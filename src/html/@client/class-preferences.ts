document.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.matches('[data-class-preference]')) {
    return
  }

  const preferences = target.closest<HTMLElement>('#queue-class-preferences')
  const form = target.closest<HTMLFormElement>('#queue')
  if (!preferences || !form) {
    return
  }

  const selected = [
    ...preferences.querySelectorAll<HTMLInputElement>('[data-class-preference]:checked'),
  ]
  if (selected.length === 0) {
    target.checked = true
    return
  }

  if (!preferences.dataset.ownSlot) {
    return
  }

  const submitter = preferences.querySelector<HTMLButtonElement>(
    '[data-class-preferences-submit]',
  )
  if (submitter) {
    form.requestSubmit(submitter)
  }
})
