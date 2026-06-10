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
 * Toughness used for wound rolls: the majority of models in the unit,
 * the highest value on a tie (an attached character counts as one model).
 */
export function effectiveToughness(defender: DefenderInput): number {
  if (!defender.attached) return defender.toughness
  if (defender.models > 1) return defender.toughness
  return Math.max(defender.toughness, defender.attached.toughness)
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

// --- per-attack-die resolution ----------------------------------------------

/** One possible outcome of an attack die: how many wounds reached the save
 * step (savable) and how many bypass it entirely (Devastating Wounds). */
interface WoundBranch {
  p: number
  savable: number
  unsavable: number
}

interface WeaponResolution {
  /** Total attack dice across all weapons with this profile */
  attacks: Dist
  /** Wound outcomes of one attack die */
  perDie: WoundBranch[]
  /** Save-failure probability and post-FNP damage per defender segment */
  bodyguard: { fail: number; damage: Dist }
  character?: { fail: number; damage: Dist }
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
    const models = defender.models + (defender.attached ? 1 : 0)
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
  const bodyguard = {
    fail: failSaveProb(defender.save, defender.invuln, profile.ap, saveOptions),
    damage: foldDefences(baseDamage, reduction, defender.feelNoPain),
  }
  const character = defender.attached
    ? {
        fail: failSaveProb(
          defender.attached.save,
          defender.attached.invuln,
          profile.ap,
          saveOptions,
        ),
        damage: foldDefences(
          baseDamage,
          reduction,
          defender.attached.feelNoPain,
        ),
      }
    : undefined

  // reporting expectations
  const eSustained = expectation(sustained)
  const eHits = torrent ? 1 : hit.hit + hit.crit * (1 + eSustained)
  const eSavable = perDie.reduce((e, b) => e + b.p * b.savable, 0)
  const eUnsavable = perDie.reduce((e, b) => e + b.p * b.unsavable, 0)

  return {
    attacks,
    perDie,
    bodyguard,
    character,
    expectedPerDie: {
      hits: eHits,
      wounds: eSavable + eUnsavable,
      // reported with the bodyguard save; allocation handles the exact mix
      unsaved: eSavable * bodyguard.fail + eUnsavable,
    },
  }
}

// --- damage allocation ------------------------------------------------------

/**
 * Distribution over the defender's state: `live[slain][w]` is the
 * probability that `slain` bodyguard models are dead and the current model
 * has `w` wounds remaining; `char[w]` (when a character is attached) the
 * probability all bodyguards are dead and the character has `w` wounds
 * left; `dead` the probability everything is dead.
 */
export interface AllocationState {
  live: number[][]
  char: number[]
  dead: number
}

export function initialState(defender: DefenderInput): AllocationState {
  const live = Array.from({ length: defender.models }, () =>
    new Array<number>(defender.wounds + 1).fill(0),
  )
  live[0][defender.wounds] = 1
  return {
    live,
    char: new Array<number>((defender.attached?.wounds ?? 0) + 1).fill(0),
    dead: 0,
  }
}

const zeroState = (defender: DefenderInput): AllocationState => ({
  live: Array.from({ length: defender.models }, () =>
    new Array<number>(defender.wounds + 1).fill(0),
  ),
  char: new Array<number>((defender.attached?.wounds ?? 0) + 1).fill(0),
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
  for (let j = 0; j < state.char.length; j++) {
    acc.char[j] += weight * state.char[j]
  }
}

interface SegmentSpec {
  fail: number
  damage: Dist
}

/** Apply a single wound to the state; `savable` wounds roll the segment's
 * save first, Devastating Wounds skip it. */
function applyOneWound(
  state: AllocationState,
  defender: DefenderInput,
  bodyguard: SegmentSpec,
  character: SegmentSpec | undefined,
  savable: boolean,
): AllocationState {
  const { wounds: W, models: M } = defender
  const charW = defender.attached?.wounds ?? 0
  const next = zeroState(defender)
  next.dead = state.dead

  const qB = savable ? bodyguard.fail : 1
  for (let slain = 0; slain < M; slain++) {
    for (let w = 1; w <= W; w++) {
      const p = state.live[slain][w]
      if (p === 0) continue
      if (qB < 1) next.live[slain][w] += p * (1 - qB)
      const pTaken = p * qB
      if (pTaken === 0) continue
      for (let d = 0; d < bodyguard.damage.length; d++) {
        const pd = bodyguard.damage[d]
        if (pd === 0) continue
        if (d === 0) {
          next.live[slain][w] += pTaken * pd
        } else if (d >= w) {
          // model dies; excess damage is lost (no spillover)
          if (slain + 1 === M) {
            if (character) next.char[charW] += pTaken * pd
            else next.dead += pTaken * pd
          } else {
            next.live[slain + 1][W] += pTaken * pd
          }
        } else {
          next.live[slain][w - d] += pTaken * pd
        }
      }
    }
  }

  if (character) {
    const qC = savable ? character.fail : 1
    for (let w = 1; w <= charW; w++) {
      const p = state.char[w]
      if (p === 0) continue
      if (qC < 1) next.char[w] += p * (1 - qC)
      const pTaken = p * qC
      if (pTaken === 0) continue
      for (let d = 0; d < character.damage.length; d++) {
        const pd = character.damage[d]
        if (pd === 0) continue
        if (d === 0) next.char[w] += pTaken * pd
        else if (d >= w) next.dead += pTaken * pd
        else next.char[w - d] += pTaken * pd
      }
    }
  }
  return next
}

/** Apply one attack die's wound branches to the state */
function applyDie(
  state: AllocationState,
  defender: DefenderInput,
  r: WeaponResolution,
): AllocationState {
  const acc = zeroState(defender)
  for (const branch of r.perDie) {
    if (branch.p === 0) continue
    let cur = state
    for (let i = 0; i < branch.savable; i++) {
      cur = applyOneWound(cur, defender, r.bodyguard, r.character, true)
    }
    for (let i = 0; i < branch.unsavable; i++) {
      cur = applyOneWound(cur, defender, r.bodyguard, r.character, false)
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
  const spec = { fail: 1, damage }
  const acc = zeroState(defender)
  scaleAdd(acc, state, count[0] ?? 0)
  let cur = state
  for (let n = 1; n < count.length; n++) {
    cur = applyOneWound(
      cur,
      defender,
      spec,
      defender.attached ? spec : undefined,
      false,
    )
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
    expected.unsaved += eAttacks * r.expectedPerDie.unsaved

    const acc = zeroState(defender)
    scaleAdd(acc, state, r.attacks[0] ?? 0)
    let cur = state
    for (let n = 1; n < r.attacks.length; n++) {
      cur = applyDie(cur, defender, r)
      scaleAdd(acc, cur, r.attacks[n])
    }
    state = acc
  }

  // marginals
  const { wounds: W, models: M } = defender
  const charW = defender.attached?.wounds ?? 0
  const slain = new Array<number>(M + 1).fill(0)
  const damage = new Array<number>(M * W + charW + 1).fill(0)
  for (let k = 0; k < M; k++) {
    for (let w = 1; w <= W; w++) {
      const p = state.live[k][w]
      if (p === 0) continue
      slain[k] += p
      damage[k * W + (W - w)] += p
    }
  }
  for (let w = 1; w <= charW; w++) {
    const p = state.char[w]
    if (p === 0) continue
    slain[M] += p
    damage[M * W + (charW - w)] += p
  }
  slain[M] += state.dead
  damage[M * W + charW] += state.dead

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
  if (defender.attached) result.attachedSlain = state.dead
  return result
}

export const engine10e: RulesEngine = {
  edition: '10e',
  resolveAttacks,
}
