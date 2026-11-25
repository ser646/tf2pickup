function submitClassSelection(form: HTMLFormElement, joinSlot: string | undefined) {
  const joinInput = form.querySelector<HTMLInputElement>('[data-class-preferences-join]')
  if (!joinInput || !joinSlot) {
    return
  }

  joinInput.value = joinSlot
  joinInput.disabled = false
  form.requestSubmit()
  // HTMX handles the submit event synchronously and has already built FormData.
  joinInput.disabled = true
}

document.addEventListener('click', event => {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const button = target.closest<HTMLButtonElement>('[data-class-primary]')
  if (!button || button.disabled) {
    return
  }

  const form = button.closest<HTMLFormElement>('#queue')
  if (!form) {
    return
  }

  // The class name itself selects the primary class. Checked boxes are additional classes.
  submitClassSelection(form, button.dataset.classPrimaryJoin)
})

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
  // Keep their checkboxes in sync and submit each available class only once.
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

  // Before joining, checkboxes only prepare additional classes locally. The player
  // joins by clicking a class name, which submits the primary class and these checks.
  const joinSlot = target.dataset.classPreferenceJoin
  if (joinSlot) {
    submitClassSelection(form, joinSlot)
  }
})
