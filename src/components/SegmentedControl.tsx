interface SegmentedControlProps<T extends string | number> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-col gap-1" role="group" aria-label={label}>
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex">
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={
                'border px-2 py-1 font-mono text-xs uppercase -ml-px first:ml-0 ' +
                (active
                  ? 'z-10 border-[var(--color-green)] text-[var(--color-green)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]')
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
