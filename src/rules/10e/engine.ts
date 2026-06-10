import { parseDice } from './dice.ts'
import {
  certain,
  compound,
  convolve,
  convolvePower,
  expectation,
  mapValues,
  mix,
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

/** Probability a savable wound gets past armour/invuln (1 = no save) */
export function failSaveProb(
  defender: DefenderInput,
  ap: number,
  options: { ranged: boolean; inCover: boolean; ignoresCover: boolean },
): number {
  let armour = defender.save + ap
  const coverApplies =
    options.inCover &&
    options.ranged &&
    !options.ignoresCover &&
    // 3+ or better saves get no cover benefit against AP 0
    !(ap === 0 && defender.save <= 3)
  if (coverApplies) armour -= 1
  let needed = defender.invuln ? Math.min(armour, defender.invuln) : armour
  needed = Math.max(needed, 2)
  if (needed > 6) return 1
  return 1 - (7 - needed) / 6
}

// --- per-attack-die resolution ----------------------------------------------

interface WeaponResolution {
  /** Total attack dice across all weapons with this profile */
  attacks: Dist
  /** Distribution of damaging (post-save) wounds from one attack die */
  damagingPerDie: Dist
  /** Damage actually suffered per damaging wound (post reduction & FNP) */
  damagePerWound: Dist
  expectedPerDie: { hits: number; wounds: number }
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
    const bonus = Math.floor(defender.models / 5)
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
    woundTarget(profile.strength, defender.toughness),
    woundMod,
    critWoundOn,
    rerollWounds,
  )

  // save
  const qSave = failSaveProb(defender, profile.ap, {
    ranged,
    inCover: context.inCover ?? false,
    ignoresCover: kw.ignoresCover,
  })

  // per wound-rolling hit: P(it becomes a damaging wound)
  // critical wounds with Devastating Wounds skip the save entirely
  const dwActive = kw.devastatingWounds
  const pDamagingPerHit =
    (wound.hit + (dwActive ? 0 : wound.crit)) * qSave +
    (dwActive ? wound.crit : 0)
  const damagingPerHit: Dist = [1 - pDamagingPerHit, pDamagingPerHit]
  // lethal-hit auto-wounds are normal (savable, never devastating) wounds
  const damagingPerAutoWound: Dist = [1 - qSave, qSave]

  // per attack die: mix over miss / normal hit / critical hit branches
  const sustained = kw.sustainedHits ?? certain(0)
  const critBranch = kw.lethalHits
    ? // crit: auto-wound + X sustained extra hits that roll to wound
      convolve(damagingPerAutoWound, compound(sustained, damagingPerHit))
    : // crit: 1+X hits that roll to wound
      compound(convolve(certain(1), sustained), damagingPerHit)
  const damagingPerDie = torrent
    ? damagingPerHit
    : mix([
        { dist: certain(0), weight: hit.miss },
        { dist: damagingPerHit, weight: hit.hit },
        { dist: critBranch, weight: hit.crit },
      ])

  // damage per damaging wound
  let damagePerWound = parseDice(profile.damage)
  if (kw.melta && context.halfRange && ranged) {
    damagePerWound = convolve(damagePerWound, kw.melta)
  }
  const reduction = defender.damageReduction ?? 0
  if (reduction > 0) {
    damagePerWound = mapValues(damagePerWound, (d) =>
      d > 0 ? Math.max(1, d - reduction) : 0,
    )
  }
  if (defender.feelNoPain) {
    const pTaken = Math.max(0, Math.min(1, (defender.feelNoPain - 1) / 6))
    damagePerWound = compound(damagePerWound, [1 - pTaken, pTaken])
  }

  // reporting expectations
  const eSustained = expectation(sustained)
  const eHits = torrent ? 1 : hit.hit + hit.crit * (1 + eSustained)
  const woundRollers = torrent
    ? 1
    : hit.hit + hit.crit * (kw.lethalHits ? eSustained : 1 + eSustained)
  const autoWounds = torrent || !kw.lethalHits ? 0 : hit.crit
  const eWounds = woundRollers * (wound.hit + wound.crit) + autoWounds

  return {
    attacks,
    damagingPerDie,
    damagePerWound,
    expectedPerDie: { hits: eHits, wounds: eWounds },
  }
}

// --- damage allocation ------------------------------------------------------

/**
 * Distribution over the defender's state: `live[slain][w]` is the
 * probability that `slain` models are dead and the current model has `w`
 * wounds remaining; `dead` is the probability the unit is destroyed.
 */
export interface AllocationState {
  live: number[][]
  dead: number
}

export function initialState(defender: DefenderInput): AllocationState {
  const live = Array.from({ length: defender.models }, () =>
    new Array<number>(defender.wounds + 1).fill(0),
  )
  live[0][defender.wounds] = 1
  return { live, dead: 0 }
}

function applyOneWound(
  state: AllocationState,
  damage: Dist,
  defender: DefenderInput,
): AllocationState {
  const { wounds: W, models: M } = defender
  const live = Array.from({ length: M }, () => new Array<number>(W + 1).fill(0))
  let dead = state.dead
  for (let slain = 0; slain < M; slain++) {
    for (let w = 1; w <= W; w++) {
      const p = state.live[slain][w]
      if (p === 0) continue
      for (let d = 0; d < damage.length; d++) {
        const pd = damage[d]
        if (pd === 0) continue
        if (d === 0) {
          live[slain][w] += p * pd
        } else if (d >= w) {
          // model dies; excess damage is lost (no spillover)
          if (slain + 1 === M) dead += p * pd
          else live[slain + 1][W] += p * pd
        } else {
          live[slain][w - d] += p * pd
        }
      }
    }
  }
  return { live, dead }
}

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

/** Apply a distribution-many iid damaging wounds to the defender state */
export function applyWounds(
  state: AllocationState,
  count: Dist,
  damage: Dist,
  defender: DefenderInput,
): AllocationState {
  const acc: AllocationState = {
    live: state.live.map((row) => row.map(() => 0)),
    dead: 0,
  }
  scaleAdd(acc, state, count[0] ?? 0)
  let cur = state
  for (let n = 1; n < count.length; n++) {
    cur = applyOneWound(cur, damage, defender)
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
    const damaging = compound(r.attacks, r.damagingPerDie)
    expected.unsaved += expectation(damaging)
    state = applyWounds(state, damaging, r.damagePerWound, defender)
  }

  // marginals
  const { wounds: W, models: M } = defender
  const slain = new Array<number>(M + 1).fill(0)
  const damage = new Array<number>(M * W + 1).fill(0)
  for (let k = 0; k < M; k++) {
    for (let w = 1; w <= W; w++) {
      const p = state.live[k][w]
      if (p === 0) continue
      slain[k] += p
      damage[k * W + (W - w)] += p
    }
  }
  slain[M] += state.dead
  damage[M * W] += state.dead

  const slainDist = trim(slain)
  const damageDist = trim(damage)
  return {
    expected: {
      ...expected,
      damage: expectation(damageDist),
      modelsSlain: expectation(slainDist),
    },
    slain: slainDist,
    damage: damageDist,
    unitKilled: state.dead,
  }
}

export const engine10e: RulesEngine = {
  edition: '10e',
  resolveAttacks,
}
