import { parseDice } from './dice.ts'
import {
  certain,
  compound,
  convolve,
  convolvePower,
  expectation,
  mapValues,
  trim,
  type Dist,
} from './dist.ts'
import { parseKeywords, type ParsedKeywords } from './keywords.ts'
import type {
  AttackContext,
  AttackResult,
  DefenderInput,
  RerollMode,
  RulesEngine,
  WeaponInput,
} from '../types.ts'

// --- dice roll mechanics ----------------------------------------------------

const clampMod = (mod: number): number => Math.max(-1, Math.min(1, mod))

interface RollOutcome {
  miss: number
  hit: number
  crit: number
}

/**
 * Outcome probabilities for one d6 roll: `needed`+ to succeed, with a
 * (pre-capped) modifier, criticals on unmodified `critOn`+, and re-rolls.
 * Unmodified 1 always fails; unmodified 6 always succeeds; criticals
 * always succeed.
 */
export function rollOutcomes(
  needed: number,
  mod: number,
  critOn: number,
  reroll: RerollMode,
): RollOutcome {
  const base: RollOutcome = { miss: 0, hit: 0, crit: 0 }
  for (let u = 1; u <= 6; u++) {
    const p = 1 / 6
    if (u >= critOn) base.crit += p
    else if (u === 1) base.miss += p
    else if (u === 6 || u + mod >= needed) base.hit += p
    else base.miss += p
  }
  let rerolledMass = 0
  if (reroll === 'ones') {
    // an unmodified 1 is always a failure (critOn is at least 2)
    rerolledMass = 1 / 6
  } else if (reroll === 'fails') {
    rerolledMass = base.miss
  }
  if (rerolledMass === 0) return base
  return {
    miss: base.miss - rerolledMass + rerolledMass * base.miss,
    hit: base.hit + rerolledMass * base.hit,
    crit: base.crit + rerolledMass * base.crit,
  }
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

/** Probability a savable wound gets past armour/invuln (1 = no save) */
export function failSaveProb(
  save: number,
  invuln: number | undefined,
  ap: number,
  options: { ranged: boolean; inCover: boolean; ignoresCover: boolean },
): number {
  let armour = save + ap
  const coverApplies =
    options.inCover &&
    options.ranged &&
    !options.ignoresCover &&
    // 3+ or better saves get no cover benefit against AP 0
    !(ap === 0 && save <= 3)
  if (coverApplies) armour -= 1
  let needed = invuln ? Math.min(armour, invuln) : armour
  needed = Math.max(needed, 2)
  if (needed > 6) return 1
  return 1 - (7 - needed) / 6
}

// --- defender layout ---------------------------------------------------------

/** Per-model-slot view of the segments: slot i is the model that takes
 * damage once i models are dead. */
interface DefenderLayout {
  total: number
  /** segment index per model slot */
  segOf: number[]
  /** wounds characteristic per model slot */
  wounds: number[]
  /** total wounds in slots before slot i (effective-damage offset) */
  cumWounds: number[]
  /** model slots that are not the attached character */
  bodyguards: number
}

function layout(defender: DefenderInput): DefenderLayout {
  const segOf: number[] = []
  const wounds: number[] = []
  defender.segments.forEach((seg, i) => {
    for (let m = 0; m < seg.models; m++) {
      segOf.push(i)
      wounds.push(Math.max(1, seg.wounds))
    }
  })
  const cumWounds = [0]
  for (const w of wounds) cumWounds.push(cumWounds[cumWounds.length - 1] + w)
  const total = wounds.length
  return {
    total,
    segOf,
    wounds,
    cumWounds,
    bodyguards: defender.attachedLast ? total - 1 : total,
  }
}

// --- per-attack-die resolution ----------------------------------------------

/** One possible outcome of an attack die: how many wounds reached the save
 * step (savable) and how many bypass it entirely (Devastating Wounds). */
interface WoundBranch {
  p: number
  savable: number
  unsavable: number
}

interface SegmentSpec {
  fail: number
  damage: Dist
}

interface WeaponResolution {
  /** Total attack dice across all weapons with this profile */
  attacks: Dist
  /** Wound outcomes of one attack die */
  perDie: WoundBranch[]
  /** Save-failure probability and post-FNP damage per defender segment */
  specs: SegmentSpec[]
  expectedPerDie: { hits: number; wounds: number; unsaved: number }
}

/** counts of (savable, unsavable) wounds from k independent wound rolls */
function woundRollBranches(
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

function mergeBranches(
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

function foldDefences(
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

function resolveWeapon(
  weapon: WeaponInput,
  defender: DefenderInput,
  context: AttackContext,
  kw: ParsedKeywords,
): WeaponResolution {
  const { profile } = weapon
  const ranged = profile.type === 'ranged'

  // attacks per weapon
  let attacksPerWeapon = parseDice(profile.attacks)
  if (kw.blast) {
    const models = defender.segments.reduce((sum, s) => sum + s.models, 0)
    const bonus = Math.floor(models / 5)
    if (bonus > 0) attacksPerWeapon = convolve(attacksPerWeapon, certain(bonus))
  }
  if (kw.rapidFire && context.halfRange && ranged) {
    attacksPerWeapon = convolve(attacksPerWeapon, kw.rapidFire)
  }
  const attacks = convolvePower(attacksPerWeapon, weapon.count)

  // hit roll
  const torrent = kw.torrent || profile.skill === 0
  const heavyBonus = kw.heavy && context.stationary && ranged ? 1 : 0
  const hitMod = clampMod((context.hitMod ?? 0) + heavyBonus)
  const critHitOn = Math.max(2, Math.min(6, context.critHitOn ?? 6))
  const hit = torrent
    ? { miss: 0, hit: 1, crit: 0 }
    : rollOutcomes(
        profile.skill,
        hitMod,
        critHitOn,
        context.rerollHits ?? 'none',
      )

  // wound roll
  const defenderKeywords = new Set(
    (defender.keywords ?? []).map((k) => k.toLowerCase()),
  )
  const antiThresholds = kw.anti
    .filter((a) => defenderKeywords.has(a.keyword))
    .map((a) => a.threshold)
  const critWoundOn = Math.max(2, Math.min(6, ...antiThresholds, 6))
  const lanceBonus = kw.lance && context.charged && !ranged ? 1 : 0
  const woundMod = clampMod((context.woundMod ?? 0) + lanceBonus)
  const rerollWounds = kw.twinLinked
    ? 'fails'
    : (context.rerollWounds ?? 'none')
  const wound = rollOutcomes(
    woundTarget(profile.strength, effectiveToughness(defender)),
    woundMod,
    critWoundOn,
    rerollWounds,
  )

  // critical wounds with Devastating Wounds skip the save entirely
  const dwActive = kw.devastatingWounds
  const pSavable = wound.hit + (dwActive ? 0 : wound.crit)
  const pUnsavable = dwActive ? wound.crit : 0

  // per attack die: mix over miss / normal hit / critical hit branches
  const sustained = kw.sustainedHits ?? certain(0)
  const oneRoll = woundRollBranches(1, pSavable, pUnsavable)
  let perDie: WoundBranch[]
  if (torrent) {
    perDie = oneRoll
  } else {
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
    perDie = mergeBranches([
      {
        weight: hit.miss,
        branches: [{ p: 1, savable: 0, unsavable: 0 }],
      },
      { weight: hit.hit, branches: oneRoll },
      ...critEntries.map((e) => ({
        weight: hit.crit * e.weight,
        branches: e.branches,
      })),
    ])
  }

  // save and damage per defender segment
  const saveOptions = {
    ranged,
    inCover: context.inCover ?? false,
    ignoresCover: kw.ignoresCover,
  }
  let baseDamage = parseDice(profile.damage)
  if (kw.melta && context.halfRange && ranged) {
    baseDamage = convolve(baseDamage, kw.melta)
  }
  const reduction = defender.damageReduction ?? 0
  const specs = defender.segments.map((seg) => ({
    fail: failSaveProb(seg.save, seg.invuln, profile.ap, saveOptions),
    damage: foldDefences(baseDamage, reduction, seg.feelNoPain),
  }))

  // reporting expectations
  const eSustained = expectation(sustained)
  const eHits = torrent ? 1 : hit.hit + hit.crit * (1 + eSustained)
  const eSavable = perDie.reduce((e, b) => e + b.p * b.savable, 0)
  const eUnsavable = perDie.reduce((e, b) => e + b.p * b.unsavable, 0)

  return {
    attacks,
    perDie,
    specs,
    expectedPerDie: {
      hits: eHits,
      wounds: eSavable + eUnsavable,
      // reported with the first segment's save; allocation is exact
      unsaved: eSavable * (specs[0]?.fail ?? 1) + eUnsavable,
    },
  }
}

// --- damage allocation ------------------------------------------------------

/**
 * Distribution over the defender's state: `live[i][w]` is the probability
 * that `i` models are dead and the model currently taking damage has `w`
 * wounds remaining; `dead` the probability everything is dead.
 */
export interface AllocationState {
  live: number[][]
  dead: number
}

export function initialState(defender: DefenderInput): AllocationState {
  const flat = layout(defender)
  const live = Array.from({ length: flat.total }, (_, i) =>
    new Array<number>(flat.wounds[i] + 1).fill(0),
  )
  live[0][flat.wounds[0]] = 1
  return { live, dead: 0 }
}

const zeroState = (flat: DefenderLayout): AllocationState => ({
  live: Array.from({ length: flat.total }, (_, i) =>
    new Array<number>(flat.wounds[i] + 1).fill(0),
  ),
  dead: 0,
})

function scaleAdd(
  acc: AllocationState,
  state: AllocationState,
  weight: number,
): void {
  if (weight === 0) return
  acc.dead += weight * state.dead
  for (let i = 0; i < state.live.length; i++) {
    for (let j = 0; j < state.live[i].length; j++) {
      acc.live[i][j] += weight * state.live[i][j]
    }
  }
}

/** Apply a single wound to the state; `savable` wounds roll the current
 * model's save first, Devastating Wounds skip it. */
function applyOneWound(
  state: AllocationState,
  flat: DefenderLayout,
  specs: SegmentSpec[],
  savable: boolean,
): AllocationState {
  const next = zeroState(flat)
  next.dead = state.dead
  for (let i = 0; i < flat.total; i++) {
    const spec = specs[flat.segOf[i]]
    const q = savable ? spec.fail : 1
    for (let w = 1; w <= flat.wounds[i]; w++) {
      const p = state.live[i][w]
      if (p === 0) continue
      if (q < 1) next.live[i][w] += p * (1 - q)
      const pTaken = p * q
      if (pTaken === 0) continue
      for (let d = 0; d < spec.damage.length; d++) {
        const pd = spec.damage[d]
        if (pd === 0) continue
        if (d === 0) {
          next.live[i][w] += pTaken * pd
        } else if (d >= w) {
          // model dies; excess damage is lost (no spillover)
          if (i + 1 === flat.total) next.dead += pTaken * pd
          else next.live[i + 1][flat.wounds[i + 1]] += pTaken * pd
        } else {
          next.live[i][w - d] += pTaken * pd
        }
      }
    }
  }
  return next
}

/** Apply one attack die's wound branches to the state */
function applyDie(
  state: AllocationState,
  flat: DefenderLayout,
  r: WeaponResolution,
): AllocationState {
  const acc = zeroState(flat)
  for (const branch of r.perDie) {
    if (branch.p === 0) continue
    let cur = state
    for (let i = 0; i < branch.savable; i++) {
      cur = applyOneWound(cur, flat, r.specs, true)
    }
    for (let i = 0; i < branch.unsavable; i++) {
      cur = applyOneWound(cur, flat, r.specs, false)
    }
    scaleAdd(acc, cur, branch.p)
  }
  return acc
}

/** Test helper: apply a distribution-many unsaved wounds of flat damage */
export function applyWounds(
  state: AllocationState,
  count: Dist,
  damage: Dist,
  defender: DefenderInput,
): AllocationState {
  const flat = layout(defender)
  const specs = defender.segments.map(() => ({ fail: 1, damage }))
  const acc = zeroState(flat)
  scaleAdd(acc, state, count[0] ?? 0)
  let cur = state
  for (let n = 1; n < count.length; n++) {
    cur = applyOneWound(cur, flat, specs, false)
    scaleAdd(acc, cur, count[n])
  }
  return acc
}

// --- engine -----------------------------------------------------------------

export function resolveAttacks(
  weapons: WeaponInput[],
  defender: DefenderInput,
  context: AttackContext = {},
): AttackResult {
  const flat = layout(defender)
  let state = initialState(defender)
  const expected = { attacks: 0, hits: 0, wounds: 0, unsaved: 0 }

  for (const weapon of weapons) {
    if (weapon.count <= 0) continue
    const kw = parseKeywords(weapon.profile.keywords)
    const r = resolveWeapon(weapon, defender, context, kw)
    const eAttacks = expectation(r.attacks)
    expected.attacks += eAttacks
    expected.hits += eAttacks * r.expectedPerDie.hits
    expected.wounds += eAttacks * r.expectedPerDie.wounds
    expected.unsaved += eAttacks * r.expectedPerDie.unsaved

    const acc = zeroState(flat)
    scaleAdd(acc, state, r.attacks[0] ?? 0)
    let cur = state
    for (let n = 1; n < r.attacks.length; n++) {
      cur = applyDie(cur, flat, r)
      scaleAdd(acc, cur, r.attacks[n])
    }
    state = acc
  }

  // marginals
  const slain = new Array<number>(flat.bodyguards + 1).fill(0)
  const totalWounds = flat.cumWounds[flat.total]
  const damage = new Array<number>(totalWounds + 1).fill(0)
  for (let i = 0; i < flat.total; i++) {
    const slainBucket = Math.min(i, flat.bodyguards)
    for (let w = 1; w <= flat.wounds[i]; w++) {
      const p = state.live[i][w]
      if (p === 0) continue
      slain[slainBucket] += p
      damage[flat.cumWounds[i] + (flat.wounds[i] - w)] += p
    }
  }
  slain[flat.bodyguards] += state.dead
  damage[totalWounds] += state.dead

  const slainDist = trim(slain)
  const damageDist = trim(damage)
  const result: AttackResult = {
    expected: {
      ...expected,
      damage: expectation(damageDist),
      modelsSlain: expectation(slainDist),
    },
    slain: slainDist,
    damage: damageDist,
    unitKilled: state.dead,
  }
  if (defender.attachedLast) result.attachedSlain = state.dead
  return result
}

export const engine10e: RulesEngine = {
  edition: '10e',
  resolveAttacks,
}
