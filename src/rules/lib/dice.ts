import { certain, convolvePower, convolve, type Dist } from './dist.ts'

const DICE_RE = /^(\d*)D(\d+)(?:\s*\+\s*(\d+))?$/i

/** Uniform distribution of one die with `sides` sides (1..sides) */
function die(sides: number): Dist {
  const d = new Array<number>(sides + 1).fill(1 / sides)
  d[0] = 0
  return d
}

/**
 * Parse a BattleScribe dice characteristic ("2", "D6", "2D6", "D6+1",
 * "2D3+1") into an exact distribution.
 */
export function parseDice(notation: string): Dist {
  const text = notation.trim()
  const flat = Number(text)
  if (Number.isInteger(flat) && flat >= 0) return certain(flat)
  const m = DICE_RE.exec(text)
  if (!m) {
    throw new Error(`Unsupported dice notation: "${notation}"`)
  }
  const count = m[1] ? Number(m[1]) : 1
  const sides = Number(m[2])
  const bonus = m[3] ? Number(m[3]) : 0
  let dist = convolvePower(die(sides), count)
  if (bonus > 0) dist = convolve(dist, certain(bonus))
  return dist
}

/** True if the notation is parseable (some data has placeholder values) */
export function isParseableDice(notation: string): boolean {
  const text = notation.trim()
  const flat = Number(text)
  return (Number.isInteger(flat) && flat >= 0) || DICE_RE.test(text)
}
