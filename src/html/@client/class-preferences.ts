document.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  const form = target.closest<HTMLFormElement>('#queue')
  if (!form) {
    return
  }

  if (target.matches('[data-select-all-classes]')) {
    const selected = target.checked
    form
      .querySelectorAll<HTMLInputElement>('[data-class-preference]:not(:disabled)')
      .forEach(input => {
        input.checked = selected
      })
    return
  }

  if (target.matches('[data-class-preference]')) {
    const selectAll = form.querySelector<HTMLInputElement>('[data-select-all-classes]')
    const eligible = [
      ...form.querySelectorAll<HTMLInputElement>('[data-class-preference]:not(:disabled)'),
    ]
    if (selectAll) {
      selectAll.checked = eligible.length > 0 && eligible.every(input => input.checked)
    }
  }
})
