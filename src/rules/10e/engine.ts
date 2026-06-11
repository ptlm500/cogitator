import {
  applyTakenWound,
  initialStateFor,
  layout,
  scaleAdd,
  summarize,
  zeroState,
  type AllocationState,
  type DefenderLayout,
} from '../lib/allocation.ts'
import { parseDice } from '../lib/dice.ts'
import {
  certain,
  convolve,
  convolvePower,
  expectation,
  mapValues,
  type Dist,
} from '../lib/dist.ts'
import { parseKeywords, type ParsedKeywords } from '../lib/keywords.ts'
import {
  applyDamageReroll,
  buildPerDieBranches,
  effectiveToughness,
  foldDefences,
  rollOutcomes,
  strongerReroll,
  woundTarget,
  type WoundBranch,
} from '../lib/sequence.ts'
import type {
  AttackContext,
  AttackResult,
  DefenderInput,
  RulesEngine,
  WeaponInput,
} from '../types.ts'

export { effectiveToughness, rollOutcomes, woundTarget }
export type { AllocationState }

const clampMod = (mod: number): number => Math.max(-1, Math.min(1, mod))

/** Probability a savable wound gets past armour/invuln (1 = no save).
 * In 10e, cover improves the armour save by 1 against ranged attacks. */
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

interface SegmentSpec {
  fail: number
  damage: Dist
}

interface WeaponResolution {
  attacks: Dist
  perDie: WoundBranch[]
  specs: SegmentSpec[]
  expectedPerDie: { hits: number; wounds: number; unsaved: number }
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
  if (profile.attacksBonus) {
    const bonus = profile.attacksBonus
    attacksPerWeapon = mapValues(attacksPerWeapon, (a) =>
      Math.max(1, a + bonus),
    )
  }
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
        profile.rerollHits ?? context.rerollHits ?? 'none',
      )

  // wound roll
  const defenderKeywords = new Set(
    (defender.keywords ?? []).map((k) => k.toLowerCase()),
  )
  const antiThresholds = kw.anti
    // "Anti-* N+" (manual grants) applies against any target
    .filter((a) => a.keyword === '*' || defenderKeywords.has(a.keyword))
    .map((a) => a.threshold)
  const critWoundOn = Math.max(2, Math.min(6, ...antiThresholds, 6))
  const lanceBonus = kw.lance && context.charged && !ranged ? 1 : 0
  const woundMod = clampMod((context.woundMod ?? 0) + lanceBonus)
  // per-profile setting wins; otherwise Twin-linked and the global grant
  // both apply and the wider re-roll subsumes the narrower
  const rerollWounds =
    profile.rerollWounds ??
    strongerReroll(
      kw.twinLinked ? 'fails' : 'none',
      context.rerollWounds ?? 'none',
    )
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
  const perDie = buildPerDieBranches(hit, pSavable, pUnsavable, kw, torrent)

  // save and damage per defender segment
  const saveOptions = {
    ranged,
    inCover: context.inCover ?? false,
    ignoresCover: kw.ignoresCover,
  }
  let baseDamage = parseDice(profile.damage)
  if (profile.damageBonus) {
    const bonus = profile.damageBonus
    baseDamage = mapValues(baseDamage, (d) => Math.max(1, d + bonus))
  }
  if (kw.melta && context.halfRange && ranged) {
    baseDamage = convolve(baseDamage, kw.melta)
  }
  baseDamage = applyDamageReroll(
    baseDamage,
    profile.rerollDamage ?? context.rerollDamage ?? 'none',
  )
  const reduction = defender.damageReduction ?? 0
  const specs = defender.segments.map((seg) => ({
    fail: failSaveProb(seg.save, seg.invuln, profile.ap, saveOptions),
    damage: foldDefences(baseDamage, reduction, seg.feelNoPain),
  }))

  // reporting expectations
  const eSustained = expectation(kw.sustainedHits ?? certain(0))
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

export function initialState(defender: DefenderInput): AllocationState {
  return initialStateFor(layout(defender))
}

function applyOneWound(
  state: AllocationState,
  flat: DefenderLayout,
  specs: SegmentSpec[],
  savable: boolean,
): AllocationState {
  return applyTakenWound(
    state,
    flat,
    (seg) => (savable ? specs[seg].fail : 1),
    (seg) => specs[seg].damage,
  )
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
  let state = initialStateFor(flat)
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

  return summarize(state, flat, expected)
}

export const engine10e: RulesEngine = {
  edition: '10e',
  resolveAttacks,
}
