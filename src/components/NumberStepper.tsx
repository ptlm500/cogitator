interface NumberStepperProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label?: string
  format?: (value: number) => string
  /** Highlight the value, e.g. when it overrides a data-derived default */
  emphasis?: boolean
}

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  label,
  format = (v) => String(v),
  emphasis = false,
}: NumberStepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const buttonClass =
    'h-6 w-6 border border-[var(--border)] font-mono text-xs leading-none ' +
    'text-[var(--text-muted)] hover:border-[var(--color-green)] ' +
    'hover:text-[var(--color-green)] disabled:opacity-30 ' +
    'disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-muted)]'
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={label ? `Decrease ${label}` : 'Decrease'}
      >
        -
      </button>
      <span
        className={
          'w-8 text-center font-mono text-sm ' +
          (emphasis
            ? 'text-[var(--color-amber)]'
            : 'text-[var(--text-primary)]')
        }
      >
        {format(value)}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label={label ? `Increase ${label}` : 'Increase'}
      >
        +
      </button>
    </div>
  )
}
