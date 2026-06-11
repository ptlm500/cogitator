// Damage-allocation primitives shared between edition engines: the defender
// is flattened into model slots taken in order, and the chain state tracks
// (models slain, wounds remaining on the current model).
import { expectation, trim, type Dist } from './dist.ts'
import type { AttackResult, DefenderInput } from '../types.ts'

/** Per-model-slot view of the segments: slot i is the model that takes
 * damage once i models are dead. */
export interface DefenderLayout {
  total: number
  /** segment index per model slot */
  segOf: number[]
  /** wounds characteristic per model slot */
  wounds: number[]
  /** total wounds in slots before slot i (effective-damage offset) */
  cumWounds: number[]
  /** model slots that are not attached characters */
  bodyguards: number
  /** last model slot of each character segment, in order */
  characterSlots: number[]
}

export function layout(defender: DefenderInput): DefenderLayout {
  const segOf: number[] = []
  const wounds: number[] = []
  const characterSlots: number[] = []
  let bodyguards = 0
  defender.segments.forEach((seg, i) => {
    for (let m = 0; m < seg.models; m++) {
      segOf.push(i)
      wounds.push(Math.max(1, seg.wounds))
    }
    if (seg.isCharacter) characterSlots.push(segOf.length - 1)
    else bodyguards += seg.models
  })
  const cumWounds = [0]
  for (const w of wounds) cumWounds.push(cumWounds[cumWounds.length - 1] + w)
  return {
    total: wounds.length,
    segOf,
    wounds,
    cumWounds,
    bodyguards,
    characterSlots,
  }
}

/**
 * Distribution over the defender's state: `live[i][w]` is the probability
 * that `i` models are dead and the model currently taking damage has `w`
 * wounds remaining; `dead` the probability everything is dead.
 */
export interface AllocationState {
  live: number[][]
  dead: number
}

export function initialStateFor(flat: DefenderLayout): AllocationState {
  const state = zeroState(flat)
  state.live[0][flat.wounds[0]] = 1
  return state
}

export const zeroState = (flat: DefenderLayout): AllocationState => ({
  live: Array.from({ length: flat.total }, (_, i) =>
    new Array<number>(flat.wounds[i] + 1).fill(0),
  ),
  dead: 0,
})

export function scaleAdd(
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

export const scaleState = (
  state: AllocationState,
  weight: number,
  flat: DefenderLayout,
): AllocationState => {
  const out = zeroState(flat)
  scaleAdd(out, state, weight)
  return out
}

/**
 * Apply one wound that has already failed its save (probability `q` of
 * being taken; pass q=1 for unsaved/mortal wounds) with the per-segment
 * damage distributions.
 */
export function applyTakenWound(
  state: AllocationState,
  flat: DefenderLayout,
  qOf: (segment: number) => number,
  damageOf: (segment: number) => Dist,
): AllocationState {
  const next = zeroState(flat)
  next.dead = state.dead
  for (let i = 0; i < flat.total; i++) {
    const q = qOf(flat.segOf[i])
    const damage = damageOf(flat.segOf[i])
    for (let w = 1; w <= flat.wounds[i]; w++) {
      const p = state.live[i][w]
      if (p === 0) continue
      if (q < 1) next.live[i][w] += p * (1 - q)
      const pTaken = p * q
      if (pTaken === 0) continue
      for (let d = 0; d < damage.length; d++) {
        const pd = damage[d]
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

/** Marginal distributions and per-character kill probabilities */
export function summarize(
  state: AllocationState,
  flat: DefenderLayout,
  expected: { attacks: number; hits: number; wounds: number; unsaved: number },
): AttackResult {
  const slain = new Array<number>(flat.bodyguards + 1).fill(0)
  const totalWounds = flat.cumWounds[flat.total]
  const damage = new Array<number>(totalWounds + 1).fill(0)
  const rowTotals = state.live.map((row) => row.reduce((a, b) => a + b, 0))
  for (let i = 0; i < flat.total; i++) {
    const slainBucket = Math.min(i, flat.bodyguards)
    slain[slainBucket] += rowTotals[i]
    for (let w = 1; w <= flat.wounds[i]; w++) {
      const p = state.live[i][w]
      if (p > 0) damage[flat.cumWounds[i] + (flat.wounds[i] - w)] += p
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
    // the unit is destroyed when all of its own models are dead; any
    // attached characters report separately via characterSlain
    unitKilled: slain[flat.bodyguards],
  }
  if (flat.characterSlots.length > 0) {
    result.characterSlain = flat.characterSlots.map((slot) => {
      let p = state.dead
      for (let i = slot + 1; i < flat.total; i++) p += rowTotals[i]
      return p
    })
  }
  return result
}
