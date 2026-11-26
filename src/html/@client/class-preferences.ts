let pendingClassPreferences: string | undefined

function savePendingClassPreferences(form: HTMLFormElement) {
  const selectedClasses = new Set(
    [...form.querySelectorAll<HTMLInputElement>('[data-class-preference]:checked')].map(
      input => input.value,
    ),
  )
  pendingClassPreferences = JSON.stringify([...selectedClasses])
}

function restorePendingClassPreferences(form: HTMLFormElement) {
  if (pendingClassPreferences === undefined) {
    return
  }

  const selectedClasses = new Set<string>(JSON.parse(pendingClassPreferences))
  const inputs = form.querySelectorAll<HTMLInputElement>('[data-class-preference]')
  for (const input of inputs) {
    input.checked = !input.disabled && selectedClasses.has(input.value)
  }

  for (const heading of form.querySelectorAll<HTMLElement>('.queue-class-heading')) {
    const checkbox = heading.querySelector<HTMLInputElement>('[data-class-preference]')
    heading.classList.toggle('queue-class-heading-selected', !!checkbox?.checked)
  }
}

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
  pendingClassPreferences = undefined
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
    input
      .closest('.queue-class-heading')
      ?.classList.toggle('queue-class-heading-selected', target.checked)
  }

  // Before joining, checkboxes only prepare additional classes locally. The player
  // joins by clicking a class name, which submits the primary class and these checks.
  const joinSlot = target.dataset.classPreferenceJoin
  if (joinSlot) {
    // The player's availability is now being submitted to the server.
    pendingClassPreferences = undefined
    submitClassSelection(form, joinSlot)
  } else {
    // Keep local selections outside the form: HTMX can replace the entire form on a WS update.
    savePendingClassPreferences(form)
  }
})

document.addEventListener('htmx:afterSwap', event => {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const form =
    target.closest<HTMLFormElement>('#queue') ?? document.querySelector<HTMLFormElement>('#queue')
  if (form) {
    restorePendingClassPreferences(form)
  }
})
