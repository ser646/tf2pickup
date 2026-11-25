document.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.matches('[data-class-preference]')) {
    return
  }

  const heading = target.closest<HTMLElement>('.queue-class-heading')
  const form = target.closest<HTMLFormElement>('#queue')
  if (!form || !heading) {
    return
  }

  const selected = [...form.querySelectorAll<HTMLInputElement>('[data-class-preference]:checked')]
  if (selected.length === 0) {
    // A player must always keep at least one available class.
    target.checked = true
    heading.classList.add('queue-class-heading-selected')
    return
  }

  // The input is intentionally visually hidden, so reflect its state on the
  // visible class heading immediately instead of waiting for a server render.
  heading.classList.toggle('queue-class-heading-selected', target.checked)

  // Before joining, the selected checkboxes are submitted together with the
  // chosen slot. Once in the queue, reuse the player's current slot to persist
  // availability changes without moving them to another slot.
  const submitter = form.querySelector<HTMLButtonElement>('[data-class-preferences-submit]')
  if (submitter) {
    form.requestSubmit(submitter)
  }
})
