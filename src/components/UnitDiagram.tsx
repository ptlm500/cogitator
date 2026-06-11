import type { CSSProperties } from 'react'
import type { ModelSlot } from '@/lib/simulation.ts'

interface UnitDiagramProps {
  /** P(total effective damage = d) by index */
  damage: number[]
  /** Defender models in allocation order */
  models: ModelSlot[]
}

const pct = (p: number) =>
  p >= 0.9995 ? '>99.9%' : p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`

/** Colour ramp for a wound pip's loss probability */
function pipStyle(q: number): CSSProperties {
  const color =
    q >= 0.95
      ? 'var(--color-red)'
      : q >= 0.6
        ? 'var(--color-amber)'
        : q >= 0.3
          ? 'var(--color-amber-light)'
          : 'var(--color-green)'
  return { backgroundColor: color, opacity: 0.3 + q * 0.7 }
}

/**
 * Abstract rank of the defending unit: one token per model in allocation
 * order, built from its wound pips. Damage strips the front models first,
 * so each pip's loss probability is exactly the tail of the damage
 * distribution at that pip's position in the unit's total wound pool.
 */
export function UnitDiagram({ damage, models }: UnitDiagramProps) {
  // lossTail[k] = P(damage >= k), computed once over the wound pool
  const totalWounds = models.reduce((sum, m) => sum + m.wounds, 0)
  const lossTail = new Array<number>(totalWounds + 1).fill(0)
  let acc = 0
  for (let k = totalWounds; k >= 1; k--) {
    acc += damage[k] ?? 0
    lossTail[k] = acc
  }
  // anything above the trimmed distribution's length is impossible
  for (let k = damage.length; k <= totalWounds; k++) lossTail[k] = 0
  const starts: number[] = []
  models.reduce((start, m) => {
    starts.push(start)
    return start + m.wounds
  }, 0)

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-3 text-xs uppercase tracking-widest text-[var(--text-muted)]">
        Casualty projection
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <span className="inline-block h-2 w-2 bg-[var(--color-green)] opacity-40" />
          intact
          <span className="ml-2 inline-block h-2 w-2 bg-[var(--color-red)]" />
          destroyed
        </span>
      </figcaption>
      <div className="flex flex-wrap items-end gap-1">
        {models.map((model, i) => {
          const start = starts[i]
          // the model dies once every one of its pips is stripped
          const slain = lossTail[start + model.wounds]
          const pipHeight = Math.max(2, Math.floor(36 / model.wounds))
          return (
            <div
              key={i}
              title={`${model.isCharacter ? 'Character' : `Model ${i + 1}`}: ${pct(slain)} slain`}
              className={
                'flex flex-col justify-end gap-px border p-px ' +
                (model.isCharacter
                  ? 'border-[var(--color-amber)]'
                  : 'border-[var(--border)]')
              }
            >
              {Array.from({ length: model.wounds }, (_, w) => {
                // pips are stripped top-down: the first wound lost is drawn
                // at the top of the token
                const pipIndex = start + w + 1
                return (
                  <span
                    key={w}
                    className="block w-2.5"
                    style={{
                      height: pipHeight,
                      ...pipStyle(lossTail[pipIndex]),
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </figure>
  )
}
