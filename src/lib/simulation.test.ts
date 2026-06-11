import { describe, expect, it } from 'vitest'
import type { Unit } from '@/data/types.ts'
import {
  defaultModelCounts,
  defaultUnitSize,
  profileRows,
  runSimulation,
  toDefenderInput,
} from './simulation.ts'

const unit: Unit = {
  id: 'u1',
  name: 'Test Squad',
  keywords: ['Infantry'],
  abilities: [],
  points: [{ pts: 100 }],
  invuln: 5,
  statlines: [
    { id: 's1', name: 'Trooper', M: '6"', T: 4, SV: 3, W: 2, LD: '6+', OC: 2 },
  ],
  models: [
    {
      id: 'sgt',
      name: 'Sergeant',
      statlineId: 's1',
      min: 1,
      max: 1,
      weapons: [
        { weaponId: 'pistol', defaultCount: 1, max: 1 },
        { weaponId: 'sword', defaultCount: 1, max: 1 },
      ],
    },
    {
      id: 'trooper',
      name: 'Trooper',
      statlineId: 's1',
      min: 0,
      max: 9,
      weapons: [{ weaponId: 'rifle', defaultCount: 1, max: 1 }],
    },
    {
      id: 'special',
      name: 'Special',
      statlineId: 's1',
      min: 0,
      max: 2,
      weapons: [{ weaponId: 'plasma', defaultCount: 1, max: 1 }],
    },
  ],
  weapons: {
    rifle: {
      id: 'rifle',
      name: 'Rifle',
      profiles: [
        {
          name: 'Rifle',
          type: 'ranged',
          range: 24,
          attacks: '2',
          skill: 3,
          strength: 4,
          ap: 1,
          damage: '1',
          keywords: [],
        },
      ],
    },
    plasma: {
      id: 'plasma',
      name: 'Plasma',
      profiles: [
        {
          name: 'Plasma - standard',
          type: 'ranged',
          range: 24,
          attacks: '1',
          skill: 3,
          strength: 7,
          ap: 2,
          damage: '1',
          keywords: [],
        },
        {
          name: 'Plasma - supercharge',
          type: 'ranged',
          range: 24,
          attacks: '1',
          skill: 3,
          strength: 8,
          ap: 3,
          damage: '2',
          keywords: ['Hazardous'],
        },
      ],
    },
    pistol: {
      id: 'pistol',
      name: 'Pistol',
      profiles: [
        {
          name: 'Pistol',
          type: 'ranged',
          range: 12,
          attacks: '1',
          skill: 3,
          strength: 4,
          ap: 0,
          damage: '1',
          keywords: ['Pistol'],
        },
      ],
    },
    sword: {
      id: 'sword',
      name: 'Sword',
      profiles: [
        {
          name: 'Sword',
          type: 'melee',
          range: 0,
          attacks: '3',
          skill: 3,
          strength: 4,
          ap: 1,
          damage: '1',
          keywords: [],
        },
      ],
    },
  },
  looseWeapons: [],
}

describe('defaultModelCounts', () => {
  it('fills the largest optional entry when only leaders have minimums', () => {
    expect(defaultModelCounts(unit)).toEqual({ sgt: 1, trooper: 9, special: 0 })
    expect(defaultUnitSize(unit)).toBe(10)
  })

  it('uses minimums when they describe a real squad', () => {
    const u = {
      ...unit,
      models: [{ ...unit.models[1], min: 4 }],
    }
    expect(defaultModelCounts(u)).toEqual({ trooper: 4 })
  })
})

describe('profileRows', () => {
  it('sums ref defaults and maxes across choice groups', () => {
    // the same weapon offered in two hardpoint groups: separate slots add up
    const u: Unit = {
      ...unit,
      models: [
        {
          id: 'sgt',
          name: 'Sergeant',
          statlineId: 's1',
          min: 1,
          max: 1,
          weapons: [
            {
              weaponId: 'rifle',
              defaultCount: 1,
              max: 1,
              choiceGroup: 'Arm A',
            },
            {
              weaponId: 'rifle',
              defaultCount: 0,
              max: 1,
              choiceGroup: 'Arm B',
            },
          ],
        },
      ],
    }
    const rows = profileRows(u, 'shooting')
    const byName = Object.fromEntries(rows.map((r) => [r.profile.name, r]))
    expect(byName['Rifle'].defaultCount).toBe(1)
    expect(byName['Rifle'].maxCount).toBe(2)
  })

  it('lists ranged profiles with derived default counts in shooting mode', () => {
    const rows = profileRows(unit, 'shooting')
    const byName = Object.fromEntries(rows.map((r) => [r.profile.name, r]))
    expect(byName['Rifle'].defaultCount).toBe(9)
    expect(byName['Pistol'].defaultCount).toBe(1)
    expect(byName['Plasma - standard'].defaultCount).toBe(0)
    expect(byName['Plasma - standard'].maxCount).toBe(2)
    // second profile of the same weapon defaults to 0
    expect(byName['Plasma - supercharge'].defaultCount).toBe(0)
    expect(rows.find((r) => r.profile.name === 'Sword')).toBeUndefined()
  })

  it('lists melee profiles in melee mode', () => {
    const rows = profileRows(unit, 'melee')
    expect(rows.map((r) => r.profile.name)).toEqual(['Sword'])
    expect(rows[0].defaultCount).toBe(1)
  })
})

describe('toDefenderInput', () => {
  it('maps statline and unit traits', () => {
    expect(toDefenderInput({ unit, modelCounts: { s1: 5 } })).toEqual({
      segments: [
        {
          models: 5,
          toughness: 4,
          save: 3,
          wounds: 2,
          invuln: 5,
          feelNoPain: undefined,
        },
      ],
      damageReduction: 0,
      keywords: ['Infantry'],
    })
  })

  it('maps an attached character with merged keywords', () => {
    const char: Unit = {
      ...unit,
      id: 'char1',
      name: 'Test Hero',
      keywords: ['Character', 'Hero'],
      invuln: 4,
      feelNoPain: 5,
      statlines: [
        {
          id: 'cs1',
          name: 'Hero',
          M: '6"',
          T: 5,
          SV: 2,
          W: 5,
          LD: '5+',
          OC: 1,
        },
      ],
    }
    const input = toDefenderInput({
      unit,
      modelCounts: { s1: 5 },
      attachedUnits: [char],
    })
    expect(input.segments[1].isCharacter).toBe(true)
    expect(input.segments[1]).toEqual({
      models: 1,
      toughness: 5,
      save: 2,
      wounds: 5,
      invuln: 4,
      feelNoPain: 5,
      isCharacter: true,
    })
    expect(input.keywords).toEqual(['Infantry', 'Character', 'Hero'])
  })

  it('builds one segment per populated statline', () => {
    const mixed: Unit = {
      ...unit,
      statlines: [
        ...unit.statlines,
        { id: 's2', name: 'Big', M: '6"', T: 6, SV: 2, W: 4, LD: '6+', OC: 2 },
      ],
    }
    const input = toDefenderInput({
      unit: mixed,
      modelCounts: { s1: 4, s2: 2 },
    })
    expect(
      input.segments.map((s) => [s.models, s.toughness, s.wounds]),
    ).toEqual([
      [4, 4, 2],
      [2, 6, 4],
    ])
  })

  it('applies per-group toughness, save, and wounds overrides', () => {
    const input = toDefenderInput({
      unit,
      modelCounts: { s1: 5 },
      groupToughness: { s1: 6 },
      groupSave: { s1: 2 },
      groupWounds: { s1: 4 },
    })
    expect(input.segments[0]).toMatchObject({
      toughness: 6,
      save: 2,
      wounds: 4,
    })
  })

  it('applies manual overrides over data values', () => {
    const input = toDefenderInput({
      unit,
      modelCounts: { s1: 5 },
      overrides: { invuln: 'none', feelNoPain: 5, damageReduction: true },
    })
    expect(input.segments[0]).toMatchObject({
      invuln: undefined,
      feelNoPain: 5,
    })
    expect(input.damageReduction).toBe(1)
  })
})

describe('runSimulation', () => {
  it('runs the engine over rows with non-zero counts', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const result = runSimulation(
      '10e',
      rows,
      { counts },
      { unit, modelCounts: { s1: 5 } },
      {},
    )
    // 9 rifles (18 shots) + 1 pistol (1 shot)
    expect(result!.expected.attacks).toBeCloseTo(19, 12)
    expect(result!.expected.modelsSlain).toBeGreaterThan(0)
  })

  it('applies BS/WS characteristic overrides per profile', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const rifleKey = rows.find((r) => r.profile.name === 'Rifle')!.key
    const defender = { unit, modelCounts: { s1: 5 } }
    const base = runSimulation('10e', rows, { counts }, defender, {})!
    // 3+ -> 2+ improves hits on the 18 rifle shots but not the pistol
    const buffed = runSimulation(
      '10e',
      rows,
      { counts, skills: { [rifleKey]: 2 } },
      defender,
      {},
    )!
    expect(base.expected.hits).toBeCloseTo(19 * (4 / 6), 12)
    expect(buffed.expected.hits).toBeCloseTo(18 * (5 / 6) + 4 / 6, 12)
  })

  it('skill overrides stack with hit roll modifiers', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const rifleKey = rows.find((r) => r.profile.name === 'Rifle')!.key
    const defender = { unit, modelCounts: { s1: 5 } }
    const result = runSimulation(
      '10e',
      rows,
      { counts, skills: { [rifleKey]: 4 } },
      defender,
      { hitMod: 1 },
    )!
    // rifles at 4+ with +1 (3+ effective), pistol at 3+ with +1 (2+ effective)
    expect(result.expected.hits).toBeCloseTo(18 * (4 / 6) + 5 / 6, 12)
  })

  it('returns undefined for an edition without an engine', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    expect(
      runSimulation(
        '99e',
        rows,
        { counts },
        { unit, modelCounts: { s1: 5 } },
        {},
      ),
    ).toBeUndefined()
  })

  it('per-row re-rolls override the global context setting', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const rifleKey = rows.find((r) => r.profile.name === 'Rifle')!.key
    const defender = { unit, modelCounts: { s1: 5 } }
    // global full hit re-roll; the rifle opts out
    const result = runSimulation(
      '10e',
      rows,
      { counts, rerollHits: { [rifleKey]: 'none' } },
      defender,
      { rerollHits: 'fails' },
    )!
    // 18 rifle shots at 3+ plain, pistol at 3+ re-rolling fails
    expect(result.expected.hits).toBeCloseTo(
      18 * (4 / 6) + (4 / 6 + (2 / 6) * (4 / 6)),
      12,
    )
  })

  it('applies attack bonuses per profile', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const rifleKey = rows.find((r) => r.profile.name === 'Rifle')!.key
    const defender = { unit, modelCounts: { s1: 5 } }
    const base = runSimulation('10e', rows, { counts }, defender, {})!
    const boosted = runSimulation(
      '10e',
      rows,
      { counts, attackBonus: { [rifleKey]: 1 } },
      defender,
      {},
    )!
    // 9 rifles gain +1 attack each
    expect(boosted.expected.attacks).toBeCloseTo(base.expected.attacks + 9, 12)
  })

  it('applies strength, AP, and damage overrides per profile', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const rifleKey = rows.find((r) => r.profile.name === 'Rifle')!.key
    const defender = { unit, modelCounts: { s1: 5 } }
    const base = runSimulation('10e', rows, { counts }, defender, {})!
    // S4 -> S8 vs T4: wound on 2+ instead of 4+
    const strong = runSimulation(
      '10e',
      rows,
      { counts, strength: { [rifleKey]: 8 } },
      defender,
      {},
    )!
    expect(strong.expected.wounds).toBeGreaterThan(base.expected.wounds)
    // AP-1 -> AP-3: more unsaved
    const sharp = runSimulation(
      '10e',
      rows,
      { counts, ap: { [rifleKey]: 3 } },
      defender,
      {},
    )!
    expect(sharp.expected.unsaved).toBeGreaterThan(base.expected.unsaved)
    // D1 -> D2: more damage
    const heavy = runSimulation(
      '10e',
      rows,
      { counts, damageBonus: { [rifleKey]: 1 } },
      defender,
      {},
    )!
    expect(heavy.expected.damage).toBeGreaterThan(base.expected.damage)
  })

  it('applies granted abilities per profile', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const rifleKey = rows.find((r) => r.profile.name === 'Rifle')!.key
    const defender = { unit, modelCounts: { s1: 5 } }
    const base = runSimulation('10e', rows, { counts }, defender, {})!
    // Lethal Hits: crits auto-wound, so expected wounds rise
    const lethal = runSimulation(
      '10e',
      rows,
      { counts, extras: { [rifleKey]: ['LH'] } },
      defender,
      {},
    )!
    expect(lethal.expected.wounds).toBeGreaterThan(base.expected.wounds)
    // Heavy grants +1 to hit while stationary
    const heavyGrant = runSimulation(
      '10e',
      rows,
      { counts, extras: { [rifleKey]: ['HV'] } },
      defender,
      { stationary: true },
    )!
    expect(heavyGrant.expected.hits).toBeGreaterThan(base.expected.hits)
    // Anti 3+ crits wounds on 3+ against any target (base needs 4s)
    const anti = runSimulation(
      '10e',
      rows,
      { counts, extras: { [rifleKey]: ['A3'] } },
      defender,
      {},
    )!
    expect(anti.expected.wounds).toBeGreaterThan(base.expected.wounds)
  })
})
