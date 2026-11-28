export function Switch(props: JSX.HtmlInputTag) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...inputProps } = props
  return (
    <label class="switch">
      <div class="pointer-events-none absolute top-[6px] left-[10px] z-10 h-[12px] w-[2px] rounded-2xl bg-zinc-100"></div>
      <div class="pointer-events-none absolute top-[6px] left-[29px] z-10 h-[12px] w-[12px] rounded-full border-2"></div>

      <input type="checkbox" class="size-full" {...inputProps} />
      <span class="slider pointer-events-none" />
    </label>
  )
}
