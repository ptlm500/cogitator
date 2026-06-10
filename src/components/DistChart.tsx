interface DistChartProps {
  title: string
  dist: number[]
  /** Label under each bar; defaults to the index */
  tickLabel?: (i: number) => string
  /** Collapse the tail once cumulative probability passes this */
  tailCutoff?: number
}

const pct = (p: number) =>
  p >= 0.0995 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`

/**
 * Bar chart for a probability distribution. Bars after the cumulative
 * cutoff are merged into a final "N+" bucket so long tails stay readable.
 */
export function DistChart({
  title,
  dist,
  tickLabel = (i) => `${i}`,
  tailCutoff = 0.999,
}: DistChartProps) {
  let cutoff = dist.length
  let cumulative = 0
  for (let i = 0; i < dist.length; i++) {
    cumulative += dist[i]
    if (cumulative >= tailCutoff && i < dist.length - 1) {
      cutoff = i + 1
      break
    }
  }
  const bars = dist.slice(0, cutoff).map((p, i) => ({
    label: tickLabel(i),
    p,
  }))
  if (cutoff < dist.length) {
    const tail = dist.slice(cutoff).reduce((a, b) => a + b, 0)
    bars.push({ label: `${tickLabel(cutoff)}+`, p: tail })
  }
  const peak = Math.max(...bars.map((b) => b.p), 1e-9)

  return (
    <figure>
      <figcaption className="mb-2 text-xs uppercase tracking-widest text-[var(--text-muted)]">
        {title}
      </figcaption>
      <div className="flex h-32 items-end gap-1">
        {bars.map((bar, i) => (
          <div
            key={i}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={`${bar.label}: ${pct(bar.p)}`}
          >
            <span className="text-[10px] leading-none text-[var(--text-muted)]">
              {bar.p >= 0.005 ? pct(bar.p) : ''}
            </span>
            <div
              className="w-full bg-[var(--color-green)] opacity-80"
              style={{
                height: `${Math.max((bar.p / peak) * 100, bar.p > 0 ? 1 : 0)}%`,
              }}
            />
            <span className="text-[10px] leading-none text-[var(--text-muted)]">
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </figure>
  )
}
