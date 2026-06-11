import { describe, expect, it } from 'vitest'
import { initialStateFor, layout } from '../lib/allocation.ts'
import { parseDice } from '../lib/dice.ts'
import { woundTarget } from '../lib/sequence.ts'
import { resolveAttacks as resolve10e } from '../10e/engine.ts'
import { applySaveBatch, resolveAttacks, saveTarget } from './engine.ts'
import type {
  AttackContext,
  DefenderInput,
  WeaponInput,
  WeaponProfileInput,
} from '../types.ts'

const ranged = (over: Partial<WeaponProfileInput>): WeaponProfileInput => ({
  type: 'ranged',
  attacks: '1',
  skill: 4,
  strength: 4,
  ap: 0,
  damage: '1',
  keywords: [],
  ...over,
})

const singleSegment = (over: Partial<DefenderInput['segments'][0]> = {}) => ({
  segments: [
    {
      models: 5,
      toughness: 4,
      save: 3,
      wounds: 2,
      ...over,
    },
  ],
})

describe('saveTarget', () => {
  it('applies AP and uses the better of armour and invuln', () => {
    expect(saveTarget(3, undefined, 0)).toBe(3)
    expect(saveTarget(3, undefined, 2)).toBe(5)
    expect(saveTarget(3, 4, 3)).toBe(4)
    expect(saveTarget(2, undefined, 0)).toBe(2)
    expect(saveTarget(6, undefined, 2)).toBe(8) // no save
  })
})

describe('11e matches 10e for uniform defenders', () => {
  // with a single defense group, sorted consumption changes nothing:
  // every die faces the same save, so the distributions must agree
  it.each([
    [
      'bolters into MEQ',
      [{ profile: ranged({ attacks: '2', skill: 3, ap: 1 }), count: 10 }],
      {},
    ],
    [
      'devastating wounds with random damage',
      [
        {
          profile: ranged({
            attacks: 'D6',
            strength: 8,
            ap: 1,
            damage: 'D3',
            keywords: ['Torrent', 'Devastating Wounds'],
          }),
          count: 2,
        },
      ],
      {},
    ],
    [
      'sustained and lethal mix',
      [
        {
          profile: ranged({
            attacks: '4',
            skill: 3,
            keywords: ['Sustained Hits 1', 'Lethal Hits'],
          }),
          count: 3,
        },
      ],
      { rerollWounds: 'ones' as const },
    ],
  ])('%s', (_name, weapons, context) => {
    const defender = singleSegment({ feelNoPain: 6 })
    const a = resolveAttacks(weapons as WeaponInput[], defender, context)
    const b = resolve10e(weapons as WeaponInput[], defender, context)
    expect(a.expected.damage).toBeCloseTo(b.expected.damage, 9)
    expect(a.expected.modelsSlain).toBeCloseTo(b.expected.modelsSlain, 9)
    expect(a.unitKilled).toBeCloseTo(b.unitKilled, 9)
    expect(a.slain.length).toBe(b.slain.length)
    a.slain.forEach((p, i) => expect(p).toBeCloseTo(b.slain[i], 9))
  })
})

describe('sorted-batch allocation', () => {
  it('back groups only face the higher dice', () => {
    // two savable wounds into: [1 model W1 no save] then [1 model W1 4+]
    // the lowest die always kills the first model; the second model dies
    // only if the highest die also fails, i.e. both dice are 1-3: p = 1/4
    const defender: DefenderInput = {
      segments: [
        { models: 1, toughness: 4, save: 6, wounds: 1 },
        { models: 1, toughness: 4, save: 2, wounds: 1 },
      ],
    }
    const flat = layout(defender)
    const specs = [
      { target: saveTarget(6, undefined, 2), damage: parseDice('1') },
      { target: saveTarget(2, undefined, 2), damage: parseDice('1') },
    ]
    const byCount = new Map([[2, initialStateFor(flat)]])
    const state = applySaveBatch(byCount, flat, specs)
    expect(state.dead).toBeCloseTo(1 / 4, 12)
    // first model always dies
    const aliveFirst = state.live[0].reduce((a, b) => a + b, 0)
    expect(aliveFirst).toBeCloseTo(0, 12)
  })

  it('10e sequential allocation is harsher on the back group', () => {
    // same scenario resolved with 10e rules: each wound rolls its own save
    // when allocated, so the second model dies at 1/2 instead of 1/4
    const weapons = [
      {
        profile: ranged({
          attacks: '2',
          strength: 8,
          ap: 2,
          keywords: ['Torrent'],
        }),
        count: 1,
      },
    ]
    const defender: DefenderInput = {
      segments: [
        { models: 1, toughness: 4, save: 6, wounds: 1 },
        { models: 1, toughness: 4, save: 2, wounds: 1 },
      ],
    }
    const r11 = resolveAttacks(weapons, defender)
    const r10 = resolve10e(weapons, defender)
    // wound rolls are 2+ so condition on both wounding: 25/36
    expect(r10.unitKilled).toBeCloseTo((25 / 36) * (1 / 2), 12)
    expect(r11.unitKilled).toBeCloseTo((25 / 36) * (1 / 4), 12)
  })
})

describe('11e hit mechanics', () => {
  it('cover is a BS penalty that stacks beyond the modifier cap', () => {
    const weapons = [{ profile: ranged({ attacks: '6', skill: 3 }), count: 1 }]
    const open = resolveAttacks(weapons, singleSegment(), {})
    const cover = resolveAttacks(weapons, singleSegment(), { inCover: true })
    const coverAndMinus = resolveAttacks(weapons, singleSegment(), {
      inCover: true,
      hitMod: -1,
    })
    expect(open.expected.hits).toBeCloseTo(4, 12) // 3+
    expect(cover.expected.hits).toBeCloseTo(3, 12) // 4+ via BS
    // 4+ at -1 = effective 5+: cover stacked with the roll modifier
    expect(coverAndMinus.expected.hits).toBeCloseTo(2, 12)
  })

  it('cover no longer improves saves', () => {
    const weapons = [
      { profile: ranged({ attacks: '6', skill: 3, ap: 1 }), count: 1 },
    ]
    const open = resolveAttacks(weapons, singleSegment(), {})
    const cover = resolveAttacks(weapons, singleSegment(), { inCover: true })
    // unsaved per hit is identical; only hit volume changes
    expect(cover.expected.unsaved / cover.expected.hits).toBeCloseTo(
      open.expected.unsaved / open.expected.hits,
      12,
    )
  })

  it('indirect fire: only 6s hit without a stationary spotter', () => {
    const weapons = [{ profile: ranged({ attacks: '6', skill: 3 }), count: 1 }]
    const r = resolveAttacks(weapons, singleSegment(), {
      indirectFire: true,
      rerollHits: 'fails', // suppressed by indirect fire
    })
    expect(r.expected.hits).toBeCloseTo(1, 12)
  })

  it('indirect fire with stationary spotter: 1-3 always fail', () => {
    const weapons = [{ profile: ranged({ attacks: '6', skill: 3 }), count: 1 }]
    // BS3+ +1 (cover) = 4+; floor 4 changes nothing extra here: 4,5 hit, 6 crits
    const r = resolveAttacks(weapons, singleSegment(), {
      indirectFire: true,
      stationary: true,
    })
    expect(r.expected.hits).toBeCloseTo(3, 12)
  })

  it('engaged applies -1 to hit and disables heavy', () => {
    const weapons = [
      {
        profile: ranged({ attacks: '6', skill: 3, keywords: ['Heavy'] }),
        count: 1,
      },
    ]
    const stationary = resolveAttacks(weapons, singleSegment(), {
      stationary: true,
    })
    const engaged = resolveAttacks(weapons, singleSegment(), {
      stationary: true,
      engaged: true,
    })
    expect(stationary.expected.hits).toBeCloseTo(5, 12) // 3+ with +1
    expect(engaged.expected.hits).toBeCloseTo(3, 12) // 3+ with -1, no heavy
  })
})

// --- Monte Carlo oracle -------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const d6 = (rng: () => number) => 1 + Math.floor(rng() * 6)

function sampleDist(dist: number[], rng: () => number): number {
  let u = rng()
  for (let i = 0; i < dist.length; i++) {
    u -= dist[i]
    if (u <= 0) return i
  }
  return dist.length - 1
}

interface SimScenario {
  weapons: WeaponInput[]
  defender: DefenderInput
  context: AttackContext
}

/** Independent simulation of the 11e attack sequence (plain weapon
 * keywords only: Torrent and Devastating Wounds). */
function simulate(scenario: SimScenario, trials: number, seed: number) {
  const { weapons, defender, context } = scenario
  const rng = mulberry32(seed)
  const flat = layout(defender)
  const majorityT = (() => {
    const counts = new Map<number, number>()
    for (const s of defender.segments) {
      counts.set(s.toughness, (counts.get(s.toughness) ?? 0) + s.models)
    }
    let best = 0
    let bestCount = 0
    for (const [t, c] of counts) {
      if (c > bestCount || (c === bestCount && t > best)) {
        best = t
        bestCount = c
      }
    }
    return best
  })()

  let sumDamage = 0
  let sumSlain = 0
  let killed = 0
  const charKills = flat.characterSlots.map(() => 0)

  for (let trial = 0; trial < trials; trial++) {
    const hp = flat.wounds.slice()
    let slot = 0
    const damageModel = (dmg: number, fnp: number | undefined) => {
      if (slot >= flat.total) return
      let taken = 0
      for (let i = 0; i < dmg; i++) {
        if (fnp === undefined || d6(rng) < fnp) taken++
      }
      hp[slot] = Math.max(0, hp[slot] - taken)
      if (hp[slot] === 0) slot++
    }

    for (const weapon of weapons) {
      const profile = weapon.profile
      const attacksDist = parseDice(profile.attacks)
      const torrent = profile.keywords.includes('Torrent')
      const dw = profile.keywords.includes('Devastating Wounds')
      const woundNeed = woundTarget(profile.strength, majorityT)
      let savable = 0
      let unsavable = 0
      for (let w = 0; w < weapon.count; w++) {
        const attacks = sampleDist(attacksDist, rng)
        for (let a = 0; a < attacks; a++) {
          let hits = 0
          if (torrent) hits = 1
          else {
            const u = d6(rng)
            const needed = profile.skill + (context.inCover && !torrent ? 1 : 0)
            if (u !== 1 && (u === 6 || u >= needed)) hits = 1
          }
          for (let h = 0; h < hits; h++) {
            const u = d6(rng)
            if (u === 1) continue
            const crit = u === 6
            if (u >= woundNeed || crit) {
              if (crit && dw) unsavable++
              else savable++
            }
          }
        }
      }
      // batch: roll all saves, sort ascending, consume in order
      const dice: number[] = []
      for (let i = 0; i < savable; i++) dice.push(d6(rng))
      dice.sort((a, b) => a - b)
      const damageDist = parseDice(profile.damage)
      for (const v of dice) {
        if (slot >= flat.total) break
        const seg = defender.segments[flat.segOf[slot]]
        const target = saveTarget(seg.save, seg.invuln, profile.ap)
        if (v < target) {
          damageModel(sampleDist(damageDist, rng), seg.feelNoPain)
        }
      }
      // mortal wounds after the batch
      for (let i = 0; i < unsavable && slot < flat.total; i++) {
        const seg = defender.segments[flat.segOf[slot]]
        damageModel(sampleDist(damageDist, rng), seg.feelNoPain)
      }
    }

    let damage = 0
    for (let i = 0; i < flat.total; i++) damage += flat.wounds[i] - hp[i]
    sumDamage += damage
    sumSlain += Math.min(slot, flat.bodyguards)
    if (slot >= flat.total) killed++
    flat.characterSlots.forEach((cs, i) => {
      if (slot > cs) charKills[i]++
    })
  }

  return {
    damage: sumDamage / trials,
    slain: sumSlain / trials,
    unitKilled: killed / trials,
    characterSlain: charKills.map((k) => k / trials),
  }
}

describe('Monte Carlo oracle', () => {
  it('mixed groups with a character', () => {
    const scenario: SimScenario = {
      weapons: [
        { profile: ranged({ attacks: '2', skill: 3, ap: 1 }), count: 5 },
        {
          profile: ranged({
            attacks: '2',
            skill: 3,
            strength: 8,
            ap: 2,
            damage: 'D3',
          }),
          count: 1,
        },
      ],
      defender: {
        segments: [
          { models: 4, toughness: 4, save: 5, wounds: 1 },
          { models: 2, toughness: 4, save: 3, wounds: 3, feelNoPain: 5 },
          {
            models: 1,
            toughness: 4,
            save: 2,
            invuln: 4,
            wounds: 4,
            isCharacter: true,
          },
        ],
      },
      context: {},
    }
    const exact = resolveAttacks(
      scenario.weapons,
      scenario.defender,
      scenario.context,
    )
    const sim = simulate(scenario, 200_000, 1234)
    expect(sim.damage).toBeCloseTo(exact.expected.damage, 1)
    expect(sim.slain).toBeCloseTo(exact.expected.modelsSlain, 1)
    expect(Math.abs(sim.unitKilled - exact.unitKilled)).toBeLessThan(0.005)
    expect(
      Math.abs(sim.characterSlain[0] - exact.characterSlain![0]),
    ).toBeLessThan(0.005)
  })

  it('devastating wounds with cover', () => {
    const scenario: SimScenario = {
      weapons: [
        {
          profile: ranged({
            attacks: 'D6',
            skill: 3,
            strength: 6,
            ap: 1,
            damage: '2',
            keywords: ['Devastating Wounds'],
          }),
          count: 3,
        },
      ],
      defender: {
        segments: [
          { models: 3, toughness: 5, save: 4, wounds: 2 },
          { models: 2, toughness: 5, save: 3, invuln: 5, wounds: 2 },
        ],
      },
      context: { inCover: true },
    }
    const exact = resolveAttacks(
      scenario.weapons,
      scenario.defender,
      scenario.context,
    )
    const sim = simulate(scenario, 200_000, 99)
    expect(sim.damage).toBeCloseTo(exact.expected.damage, 1)
    expect(sim.slain).toBeCloseTo(exact.expected.modelsSlain, 1)
    expect(Math.abs(sim.unitKilled - exact.unitKilled)).toBeLessThan(0.005)
  })
})
