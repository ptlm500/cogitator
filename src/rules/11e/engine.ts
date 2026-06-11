// 11th edition engine. Hit and wound rolls match 10e, but the save and
// allocation step is the new batch system: for each group of identical
// attacks, all save dice are rolled at once, sorted lowest-to-highest, and
// consumed in that order against the defender's segments in allocation
// order. Low dice burn on the front segments; later segments only face the
// higher rolls. Devastating Wounds resolve after the batch (the 11e mortal
// wounds step at the end of each attack group).
//
// Pending final 11e rules text (running on 10e data for now): exact weapon
// ability definitions are assumed unchanged from 10e, and Devastating
// Wounds keeps its 10e meaning (critical wounds bypass saves).
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

const clampMod = (mod: number): number => Math.max(-1, Math.min(1, mod))

/** The d6 value a segment needs to save: min of AP-modified armour and
 * invuln, floored at 2 (a 1 always fails). Above 6 means no save. */
export function saveTarget(
  save: number,
  invuln: number | undefined,
  ap: number,
): number {
  const armour = save + ap
  return Math.max(2, invuln ? Math.min(armour, invuln) : armour)
}

interface SegmentSpec {
  /** d6 result needed to save */
  target: number
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

  // hit roll. 11e: cover is a -1 BS characteristic penalty on the firer
  // (stacks beyond the ±1 roll-modifier cap); indirect fire grants the
  // target cover, suppresses hit re-rolls, and floors unmodified rolls.
  const torrent = kw.torrent || profile.skill === 0
  const indirect = Boolean(context.indirectFire) && ranged
  const coverApplies =
    ranged && !kw.ignoresCover && (Boolean(context.inCover) || indirect)
  const needed = profile.skill + (coverApplies ? 1 : 0)
  const engagedPenalty = context.engaged && ranged ? -1 : 0
  const heavyBonus =
    kw.heavy && context.stationary && ranged && !context.engaged ? 1 : 0
  const hitMod = clampMod((context.hitMod ?? 0) + heavyBonus + engagedPenalty)
  const critHitOn = Math.max(2, Math.min(6, context.critHitOn ?? 6))
  const floor = indirect ? (context.stationary ? 4 : 6) : 2
  const hit = torrent
    ? { miss: 0, hit: 1, crit: 0 }
    : rollOutcomes(
        needed,
        hitMod,
        critHitOn,
        // indirect fire suppresses all hit re-rolls, granted or global
        indirect
          ? 'none'
          : (profile.rerollHits ?? context.rerollHits ?? 'none'),
        floor,
      )

  // wound roll (unchanged from 10e)
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

  const dwActive = kw.devastatingWounds
  const pSavable = wound.hit + (dwActive ? 0 : wound.crit)
  const pUnsavable = dwActive ? wound.crit : 0
  const perDie = buildPerDieBranches(hit, pSavable, pUnsavable, kw, torrent)

  // per-segment save target and damage (no cover on saves in 11e)
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
    target: saveTarget(seg.save, seg.invuln, profile.ap),
    damage: foldDefences(baseDamage, reduction, seg.feelNoPain),
  }))

  // reporting expectations (unsaved approximated with the first segment)
  const eSustained = expectation(kw.sustainedHits ?? certain(0))
  const eHits = torrent ? 1 : hit.hit + hit.crit * (1 + eSustained)
  const eSavable = perDie.reduce((e, b) => e + b.p * b.savable, 0)
  const eUnsavable = perDie.reduce((e, b) => e + b.p * b.unsavable, 0)
  const firstFail =
    specs.length > 0 ? Math.min(1, Math.max(0, (specs[0].target - 1) / 6)) : 1

  return {
    attacks,
    perDie,
    specs,
    expectedPerDie: {
      hits: eHits,
      wounds: eSavable + eUnsavable,
      unsaved: eSavable * firstFail + eUnsavable,
    },
  }
}

// --- joint wound totals ------------------------------------------------------

/** Joint distribution of total (savable, unsavable) wounds for an attack
 * group: per-die branches compounded over the attacks distribution. */
export function compoundJoint(
  attacks: Dist,
  perDie: WoundBranch[],
): Map<string, number> {
  let cur = new Map<string, number>([['0,0', 1]])
  const acc = new Map<string, number>()
  const addTo = (map: Map<string, number>, key: string, p: number) => {
    if (p > 0) map.set(key, (map.get(key) ?? 0) + p)
  }
  if (attacks[0]) addTo(acc, '0,0', attacks[0])
  for (let n = 1; n < attacks.length; n++) {
    const next = new Map<string, number>()
    for (const [key, p] of cur) {
      const [s, u] = key.split(',').map(Number)
      for (const b of perDie) {
        addTo(next, `${s + b.savable},${u + b.unsavable}`, p * b.p)
      }
    }
    cur = next
    if (attacks[n]) {
      for (const [key, p] of cur) addTo(acc, key, p * attacks[n])
    }
  }
  return acc
}

// --- sorted-batch save allocation ---------------------------------------------

/** Apply one save die of face `v`: against the current model's segment it
 * either always saves (no change) or always fails (damage). */
function applyFaceDie(
  state: AllocationState,
  flat: DefenderLayout,
  specs: SegmentSpec[],
  v: number,
): AllocationState {
  return applyTakenWound(
    state,
    flat,
    (seg) => (v < specs[seg].target ? 1 : 0),
    (seg) => specs[seg].damage,
  )
}

function binomialPmf(n: number, p: number): number[] {
  const out = new Array<number>(n + 1).fill(0)
  out[0] = 1
  for (let trial = 0; trial < n; trial++) {
    for (let k = trial + 1; k > 0; k--) {
      out[k] = out[k] * (1 - p) + out[k - 1] * p
    }
    out[0] *= 1 - p
  }
  return out
}

/**
 * Resolve a batch of savable wounds 11e-style: roll all dice, sort
 * ascending, consume in order. Computed exactly by processing die faces
 * 1..6 in ascending order; given r dice all showing at least v, the count
 * showing exactly v is Binomial(r, 1/(7-v)).
 *
 * `byCount` maps batch size -> (absolute-probability-weighted) entry state.
 */
export function applySaveBatch(
  byCount: Map<number, AllocationState>,
  flat: DefenderLayout,
  specs: SegmentSpec[],
): AllocationState {
  let byRemaining = byCount
  for (let v = 1; v <= 6; v++) {
    const pv = 1 / (7 - v)
    const next = new Map<number, AllocationState>()
    const addTo = (rem: number, st: AllocationState, weight: number) => {
      let acc = next.get(rem)
      if (!acc) {
        acc = zeroState(flat)
        next.set(rem, acc)
      }
      scaleAdd(acc, st, weight)
    }
    for (const [rem, state] of byRemaining) {
      if (rem === 0) {
        addTo(0, state, 1)
        continue
      }
      const pmf = binomialPmf(rem, pv)
      let cur = state
      addTo(rem, cur, pmf[0])
      for (let k = 1; k <= rem; k++) {
        cur = applyFaceDie(cur, flat, specs, v)
        if (pmf[k] > 0) addTo(rem - k, cur, pmf[k])
      }
    }
    byRemaining = next
  }
  const result = zeroState(flat)
  for (const state of byRemaining.values()) scaleAdd(result, state, 1)
  return result
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

    // group joint totals by unsavable count; the savable batch resolves
    // first, then the unsavable (mortal) wounds one at a time
    const joint = compoundJoint(r.attacks, r.perDie)
    const byUnsavable = new Map<number, Map<number, number>>()
    for (const [key, p] of joint) {
      const [s, u] = key.split(',').map(Number)
      let sMap = byUnsavable.get(u)
      if (!sMap) {
        sMap = new Map()
        byUnsavable.set(u, sMap)
      }
      sMap.set(s, (sMap.get(s) ?? 0) + p)
    }

    const acc = zeroState(flat)
    for (const [u, sMap] of byUnsavable) {
      const byCount = new Map<number, AllocationState>()
      for (const [s, p] of sMap) {
        let entry = byCount.get(s)
        if (!entry) {
          entry = zeroState(flat)
          byCount.set(s, entry)
        }
        scaleAdd(entry, state, p)
      }
      let st = applySaveBatch(byCount, flat, r.specs)
      for (let i = 0; i < u; i++) {
        st = applyTakenWound(
          st,
          flat,
          () => 1,
          (seg) => r.specs[seg].damage,
        )
      }
      scaleAdd(acc, st, 1)
    }
    state = acc
  }

  return summarize(state, flat, expected)
}

export const engine11e: RulesEngine = {
  edition: '11e',
  resolveAttacks,
}
