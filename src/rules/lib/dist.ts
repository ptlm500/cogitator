/**
 * Exact probability distributions over non-negative integers.
 * dist[i] = P(value = i). Distributions always sum to ~1.
 */
export type Dist = number[]

/** Probabilities below this are treated as zero when trimming tails */
const EPSILON = 1e-14

/** A distribution that is always `value` */
export function certain(value: number): Dist {
  const d = new Array<number>(value + 1).fill(0)
  d[value] = 1
  return d
}

/** Drop a vanishing tail so arrays stay bounded */
export function trim(d: Dist): Dist {
  let end = d.length
  while (end > 1 && d[end - 1] < EPSILON) end--
  return end === d.length ? d : d.slice(0, end)
}

/** Distribution of the sum of two independent values */
export function convolve(a: Dist, b: Dist): Dist {
  const out = new Array<number>(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue
    for (let j = 0; j < b.length; j++) {
      out[i + j] += a[i] * b[j]
    }
  }
  return trim(out)
}

/** Distribution of the sum of n independent draws from d */
export function convolvePower(d: Dist, n: number): Dist {
  let result: Dist = [1]
  let base = d
  let k = n
  while (k > 0) {
    if (k & 1) result = convolve(result, base)
    base = convolve(base, base)
    k >>= 1
  }
  return result
}

/** Weighted mixture of distributions; weights must sum to 1 */
export function mix(entries: { dist: Dist; weight: number }[]): Dist {
  const len = Math.max(...entries.map((e) => e.dist.length))
  const out = new Array<number>(len).fill(0)
  for (const { dist, weight } of entries) {
    if (weight === 0) continue
    for (let i = 0; i < dist.length; i++) out[i] += weight * dist[i]
  }
  return trim(out)
}

/** Binomial(n, p): number of successes in n independent trials */
export function binomial(n: number, p: number): Dist {
  if (n === 0 || p === 0) return certain(0)
  const out = new Array<number>(n + 1).fill(0)
  // iterate Pascal-style to avoid factorial overflow
  out[0] = 1
  for (let trial = 0; trial < n; trial++) {
    for (let k = trial + 1; k > 0; k--) {
      out[k] = out[k] * (1 - p) + out[k - 1] * p
    }
    out[0] *= 1 - p
  }
  return trim(out)
}

/**
 * Sum of N independent draws from `perTrial`, where N itself is
 * distributed as `count`.
 */
export function compound(count: Dist, perTrial: Dist): Dist {
  let acc: Dist = count[0] > 0 ? [count[0]] : [0]
  let cur: Dist = [1]
  for (let n = 1; n < count.length; n++) {
    cur = convolve(cur, perTrial)
    if (count[n] === 0) continue
    const next = new Array<number>(Math.max(acc.length, cur.length)).fill(0)
    for (let i = 0; i < acc.length; i++) next[i] = acc[i]
    for (let i = 0; i < cur.length; i++) next[i] += count[n] * cur[i]
    acc = next
  }
  return trim(acc)
}

export function expectation(d: Dist): number {
  let e = 0
  for (let i = 1; i < d.length; i++) e += i * d[i]
  return e
}

/** P(value >= threshold) */
export function atLeast(d: Dist, threshold: number): number {
  let p = 0
  for (let i = threshold; i < d.length; i++) p += d[i]
  return p
}

/** Apply a value transform f (non-negative int -> non-negative int) */
export function mapValues(d: Dist, f: (v: number) => number): Dist {
  const out: number[] = []
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) continue
    const v = f(i)
    while (out.length <= v) out.push(0)
    out[v] += d[i]
  }
  return trim(out)
}
