document.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.matches('[data-class-preference]')) {
    return
  }

  const form = target.closest<HTMLFormElement>('#queue')
  if (!form) {
    return
  }

  // In team layouts the same class can have multiple visible column headings.
  // Keep their controls in sync and submit each available class only once.
  const matchingInputs = [
    ...form.querySelectorAll<HTMLInputElement>('[data-class-preference]'),
  ].filter(input => input.value === target.value)
  for (const input of matchingInputs) {
    input.checked = target.checked
    input.closest('.queue-class-heading')?.classList.toggle(
      'queue-class-heading-selected',
      target.checked,
    )
  }

  const selectedClasses = new Set(
    [...form.querySelectorAll<HTMLInputElement>('[data-class-preference]:checked')].map(
      input => input.value,
    ),
  )
  if (selectedClasses.size === 0) {
    // A player must always keep at least one available class.
    for (const input of matchingInputs) {
      input.checked = true
      input.closest('.queue-class-heading')?.classList.add('queue-class-heading-selected')
    }
    return
  }

  // Before joining, the selected checkboxes are submitted with the chosen slot.
  // Once in the queue, reuse the current slot to persist availability changes.
  const submitter = form.querySelector<HTMLButtonElement>('[data-class-preferences-submit]')
  if (submitter) {
    form.requestSubmit(submitter)
  }
})
