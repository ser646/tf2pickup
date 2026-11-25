document.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.matches('[data-class-preference]')) {
    return
  }

  const form = target.closest<HTMLFormElement>('#queue')
  if (!form) {
    return
  }

  const selected = [...form.querySelectorAll<HTMLInputElement>('[data-class-preference]:checked')]
  if (selected.length === 0) {
    target.checked = true
    return
  }

  const submitter = form.querySelector<HTMLButtonElement>('[data-class-preferences-submit]')
  if (submitter) {
    form.requestSubmit(submitter)
  }
})
