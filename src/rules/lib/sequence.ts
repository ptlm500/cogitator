// Attack-sequence helpers shared between edition engines.
import { compound, mapValues, type Dist } from './dist.ts'
import type { DamageRerollMode, DefenderInput, RerollMode } from '../types.ts'

export interface RollOutcome {
  miss: number
  hit: number
  crit: number
}

/**
 * Outcome probabilities for one d6 roll: `needed`+ to succeed, with a
 * (pre-capped) modifier, criticals on unmodified `critOn`+, and re-rolls.
 * Unmodified rolls below `floor` always fail (default: 1s); unmodified 6
 * always succeeds; criticals always succeed. A floor above 2 (11e indirect
 * fire) overrides criticals too — those rolls simply fail.
 */
export function rollOutcomes(
  needed: number,
  mod: number,
  critOn: number,
  reroll: RerollMode,
  floor = 2,
): RollOutcome {
  const base: RollOutcome = { miss: 0, hit: 0, crit: 0 }
  for (let u = 1; u <= 6; u++) {
    const p = 1 / 6
    if (u < floor) base.miss += p
    else if (u >= critOn) base.crit += p
    else if (u === 6 || u + mod >= needed) base.hit += p
    else base.miss += p
  }
  let massFromMiss = 0
  let massFromHit = 0
  if (reroll === 'ones') {
    // an unmodified 1 is always a failure (critOn is at least 2)
    massFromMiss = 1 / 6
  } else if (reroll === 'fails') {
    massFromMiss = base.miss
  } else if (reroll === 'noncrits') {
    // fish for crits: re-roll failures and plain successes alike
    massFromMiss = base.miss
    massFromHit = base.hit
  }
  const mass = massFromMiss + massFromHit
  if (mass === 0) return base
  return {
    miss: base.miss - massFromMiss + mass * base.miss,
    hit: base.hit - massFromHit + mass * base.hit,
    crit: base.crit + mass * base.crit,
  }
}

const REROLL_RANK: Record<RerollMode, number> = {
  none: 0,
  ones: 1,
  fails: 2,
  noncrits: 3,
}

/** The more permissive of two re-roll grants (a weapon's Twin-linked and a
 * global ability both apply; the wider one subsumes the narrower) */
export function strongerReroll(a: RerollMode, b: RerollMode): RerollMode {
  return REROLL_RANK[a] >= REROLL_RANK[b] ? a : b
}

/**
 * Apply a damage re-roll to a damage distribution. 'ones' re-rolls a total
 * result of 1; 'all' models a full "re-roll the Damage roll" played
 * optimally — re-roll whenever the result is below the distribution's mean.
 * Re-rolls evaluate on the damage characteristic's total (e.g. for D6+1 a
 * result of 1 cannot occur, so 'ones' never triggers).
 */
export function applyDamageReroll(dist: Dist, mode: DamageRerollMode): Dist {
  if (mode === 'none') return dist
  let mass = 0
  let kept: Dist
  if (mode === 'ones') {
    mass = dist[1] ?? 0
    if (mass === 0) return dist
    kept = dist.map((p, v) => (v === 1 ? 0 : p))
  } else {
    const mean = dist.reduce((e, p, v) => e + p * v, 0)
    kept = dist.map((p, v) => (v < mean ? 0 : p))
    mass = 1 - kept.reduce((a, b) => a + b, 0)
    if (mass === 0) return dist
  }
  return dist.map((p, v) => (kept[v] ?? 0) + mass * p)
}

/** Wound roll needed for strength vs toughness */
export function woundTarget(strength: number, toughness: number): number {
  if (strength >= 2 * toughness) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (strength * 2 <= toughness) return 6
  return 5
}

/**
 * Toughness used for wound rolls: the value shared by the majority of
 * models in the unit, the highest value on a tie.
 */
export function effectiveToughness(defender: DefenderInput): number {
  const counts = new Map<number, number>()
  for (const s of defender.segments) {
    counts.set(s.toughness, (counts.get(s.toughness) ?? 0) + s.models)
  }
  let best = 0
  let bestCount = 0
  for (const [toughness, count] of counts) {
    if (count > bestCount || (count === bestCount && toughness > best)) {
      best = toughness
      bestCount = count
    }
  }
  return best
}

/** One possible outcome of an attack die: how many wounds reached the save
 * step (savable) and how many bypass it entirely (Devastating Wounds). */
export interface WoundBranch {
  p: number
  savable: number
  unsavable: number
}

/** counts of (savable, unsavable) wounds from k independent wound rolls */
export function woundRollBranches(
  k: number,
  pSavable: number,
  pUnsavable: number,
): WoundBranch[] {
  let branches: WoundBranch[] = [{ p: 1, savable: 0, unsavable: 0 }]
  for (let roll = 0; roll < k; roll++) {
    const next = new Map<string, WoundBranch>()
    const add = (p: number, s: number, u: number) => {
      const key = `${s},${u}`
      const cur = next.get(key)
      if (cur) cur.p += p
      else next.set(key, { p, savable: s, unsavable: u })
    }
    for (const b of branches) {
      add(b.p * (1 - pSavable - pUnsavable), b.savable, b.unsavable)
      add(b.p * pSavable, b.savable + 1, b.unsavable)
      add(b.p * pUnsavable, b.savable, b.unsavable + 1)
    }
    branches = [...next.values()]
  }
  return branches
}

export function mergeBranches(
  entries: { weight: number; branches: WoundBranch[] }[],
): WoundBranch[] {
  const out = new Map<string, WoundBranch>()
  for (const { weight, branches } of entries) {
    if (weight === 0) continue
    for (const b of branches) {
      const key = `${b.savable},${b.unsavable}`
      const cur = out.get(key)
      if (cur) cur.p += weight * b.p
      else out.set(key, { ...b, p: weight * b.p })
    }
  }
  return [...out.values()].filter((b) => b.p > 0)
}

/**
 * Per-attack-die wound branches from hit/wound outcomes and keywords:
 * miss / normal hit / critical hit (with Sustained extras and Lethal
 * auto-wounds), each hit rolling the wound trinary.
 */
export function buildPerDieBranches(
  hit: RollOutcome,
  pSavable: number,
  pUnsavable: number,
  kw: { lethalHits: boolean; sustainedHits?: Dist },
  torrent: boolean,
): WoundBranch[] {
  const oneRoll = woundRollBranches(1, pSavable, pUnsavable)
  if (torrent) return oneRoll
  const sustained = kw.sustainedHits ?? [1]
  const critEntries: { weight: number; branches: WoundBranch[] }[] = []
  for (let s = 0; s < sustained.length; s++) {
    if (sustained[s] === 0) continue
    const rolling = kw.lethalHits ? s : 1 + s
    let branches = woundRollBranches(rolling, pSavable, pUnsavable)
    if (kw.lethalHits) {
      // the critical hit itself wounds automatically (a savable wound)
      branches = branches.map((b) => ({ ...b, savable: b.savable + 1 }))
    }
    critEntries.push({ weight: sustained[s], branches })
  }
  return mergeBranches([
    { weight: hit.miss, branches: [{ p: 1, savable: 0, unsavable: 0 }] },
    { weight: hit.hit, branches: oneRoll },
    ...critEntries.map((e) => ({
      weight: hit.crit * e.weight,
      branches: e.branches,
    })),
  ])
}

/** Fold damage reduction and Feel No Pain into a damage distribution */
export function foldDefences(
  base: Dist,
  reduction: number,
  feelNoPain: number | undefined,
): Dist {
  let damage = base
  if (reduction > 0) {
    damage = mapValues(damage, (d) => (d > 0 ? Math.max(1, d - reduction) : 0))
  }
  if (feelNoPain) {
    const pTaken = Math.max(0, Math.min(1, (feelNoPain - 1) / 6))
    damage = compound(damage, [1 - pTaken, pTaken])
  }
  return damage
}
