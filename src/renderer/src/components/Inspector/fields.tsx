export function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="border-b border-shell-border px-3 py-3 last:border-b-0">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-shell-muted">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
      {hint && <p className="mt-2 text-[11px] leading-snug text-shell-muted">{hint}</p>}
    </section>
  )
}

export function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[12px] text-shell-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

export function ToggleButton({
  label,
  title,
  active,
  onClick,
}: {
  label: string
  title: string
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`h-6 min-w-[28px] rounded border px-2 text-[12px] transition-colors ${
        active
          ? 'border-transparent bg-shell-text text-shell'
          : 'border-shell-border text-shell-text hover:bg-shell-hover'
      }`}
    >
      {label}
    </button>
  )
}
