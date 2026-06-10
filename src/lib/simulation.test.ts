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
  it('counts only the first default within a choice group', () => {
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
            { weaponId: 'rifle', defaultCount: 1, max: 1, choiceGroup: 'W1' },
            { weaponId: 'pistol', defaultCount: 1, max: 1, choiceGroup: 'W1' },
          ],
        },
      ],
    }
    const rows = profileRows(u, 'shooting')
    const byName = Object.fromEntries(rows.map((r) => [r.profile.name, r]))
    expect(byName['Rifle'].defaultCount).toBe(1)
    expect(byName['Pistol'].defaultCount).toBe(0)
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
    expect(toDefenderInput({ unit, statlineId: 's1', models: 5 })).toEqual({
      toughness: 4,
      save: 3,
      wounds: 2,
      models: 5,
      invuln: 5,
      feelNoPain: undefined,
      keywords: ['Infantry'],
    })
  })
})

describe('runSimulation', () => {
  it('runs the engine over rows with non-zero counts', () => {
    const rows = profileRows(unit, 'shooting')
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.defaultCount]))
    const result = runSimulation(
      '10e',
      rows,
      counts,
      { unit, statlineId: 's1', models: 5 },
      {},
    )
    // 9 rifles (18 shots) + 1 pistol (1 shot)
    expect(result.expected.attacks).toBeCloseTo(19, 12)
    expect(result.expected.modelsSlain).toBeGreaterThan(0)
  })
})
