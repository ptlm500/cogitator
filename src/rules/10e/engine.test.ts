import { describe, expect, it } from 'vitest'
import { certain } from './dist.ts'
import {
  applyWounds,
  failSaveProb,
  initialState,
  resolveAttacks,
  rollOutcomes,
  woundTarget,
} from './engine.ts'
import type { DefenderInput, WeaponProfileInput } from '../types.ts'

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

const defender = (over: Partial<DefenderInput>): DefenderInput => ({
  toughness: 4,
  save: 3,
  wounds: 2,
  models: 5,
  ...over,
})

describe('woundTarget', () => {
  it('implements the strength vs toughness table', () => {
    expect(woundTarget(8, 4)).toBe(2) // double
    expect(woundTarget(5, 4)).toBe(3) // greater
    expect(woundTarget(4, 4)).toBe(4) // equal
    expect(woundTarget(3, 4)).toBe(5) // lower
    expect(woundTarget(2, 4)).toBe(6) // half or less
  })
})

describe('rollOutcomes', () => {
  it('basic 3+ roll', () => {
    const o = rollOutcomes(3, 0, 6, 'none')
    expect(o.crit).toBeCloseTo(1 / 6, 12)
    expect(o.hit).toBeCloseTo(3 / 6, 12)
    expect(o.miss).toBeCloseTo(2 / 6, 12)
  })

  it('unmodified 1 always fails even with +1', () => {
    const o = rollOutcomes(2, 1, 6, 'none')
    expect(o.miss).toBeCloseTo(1 / 6, 12)
  })

  it('unmodified 6 always succeeds even with -1 against 6+', () => {
    const o = rollOutcomes(6, -1, 6, 'none')
    expect(o.crit).toBeCloseTo(1 / 6, 12)
    expect(o.hit).toBeCloseTo(0, 12)
  })

  it('reroll fails on 3+ gives 8/9 success', () => {
    const o = rollOutcomes(3, 0, 6, 'fails')
    expect(o.hit + o.crit).toBeCloseTo(8 / 9, 12)
  })

  it('reroll ones on 3+', () => {
    const o = rollOutcomes(3, 0, 6, 'ones')
    // 4/6 + 1/6 * 4/6
    expect(o.hit + o.crit).toBeCloseTo(4 / 6 + 4 / 36, 12)
  })

  it('expanded crit threshold', () => {
    const o = rollOutcomes(6, 0, 4, 'none')
    // 4,5,6 are crits and auto-succeed despite needing 6s
    expect(o.crit).toBeCloseTo(3 / 6, 12)
    expect(o.hit).toBeCloseTo(0, 12)
  })
})

describe('failSaveProb', () => {
  const opts = { ranged: true, inCover: false, ignoresCover: false }

  it('applies AP to the armour save', () => {
    // 3+ save, AP-1 -> 4+: fails on 1-3
    expect(failSaveProb(3, undefined, 1, opts)).toBeCloseTo(1 / 2, 12)
  })

  it('uses invuln when better', () => {
    expect(failSaveProb(3, 4, 3, opts)).toBeCloseTo(1 / 2, 12)
  })

  it('no save when AP exceeds everything', () => {
    expect(failSaveProb(6, undefined, 2, opts)).toBe(1)
  })

  it('cover improves armour by 1 against ranged', () => {
    expect(
      failSaveProb(4, undefined, 1, { ...opts, inCover: true }),
    ).toBeCloseTo(1 / 2, 12)
  })

  it('3+ or better gets no cover benefit against AP 0', () => {
    expect(
      failSaveProb(3, undefined, 0, { ...opts, inCover: true }),
    ).toBeCloseTo(1 / 3, 12)
  })

  it('ignores cover negates the bonus', () => {
    expect(
      failSaveProb(4, undefined, 1, {
        ...opts,
        inCover: true,
        ignoresCover: true,
      }),
    ).toBeCloseTo(2 / 3, 12)
  })

  it('a save of 2+ is the floor', () => {
    expect(failSaveProb(2, 4, 0, opts)).toBeCloseTo(1 / 6, 12)
  })
})

describe('resolveAttacks: classic mathhammer cases', () => {
  it('20 bolter shots into MEQ', () => {
    // 20 attacks, 3+ hit, S4 v T4 (4+), Sv3+ AP-1 (4+): E[unsaved] = 10/3
    const r = resolveAttacks(
      [{ profile: ranged({ attacks: '2', skill: 3, ap: 1 }), count: 10 }],
      defender({}),
    )
    expect(r.expected.attacks).toBeCloseTo(20, 12)
    expect(r.expected.hits).toBeCloseTo(40 / 3, 12)
    expect(r.expected.wounds).toBeCloseTo(20 / 3, 12)
    expect(r.expected.unsaved).toBeCloseTo(10 / 3, 12)
    // D1 vs 5x W2: effective damage ~ unsaved, minus the tiny tail where
    // more than the unit's 10 total wounds would be dealt
    expect(r.expected.damage).toBeCloseTo(10 / 3, 3)
    expect(r.expected.damage).toBeLessThan(10 / 3)
  })

  it('lethal hits convert crits to auto-wounds', () => {
    // 12 attacks 4+ hit, S4 v T5 (5+):
    // E[wounds] = 12 * (hit 1/3 * wound 1/3 + crit 1/6) = 10/3
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '1',
            strength: 4,
            keywords: ['Lethal Hits'],
          }),
          count: 12,
        },
      ],
      defender({ toughness: 5 }),
    )
    expect(r.expected.wounds).toBeCloseTo(10 / 3, 12)
  })

  it('sustained hits add hits on crits', () => {
    // 12 attacks 4+ hit, Sustained 1: E[hits] = 12 * (1/3 + 1/6 * 2) = 8
    const r = resolveAttacks(
      [
        {
          profile: ranged({ attacks: '1', keywords: ['Sustained Hits 1'] }),
          count: 12,
        },
      ],
      defender({}),
    )
    expect(r.expected.hits).toBeCloseTo(8, 12)
  })

  it('torrent auto-hits', () => {
    const r = resolveAttacks(
      [{ profile: ranged({ attacks: 'D6', keywords: ['Torrent'] }), count: 2 }],
      defender({}),
    )
    expect(r.expected.attacks).toBeCloseTo(7, 12)
    expect(r.expected.hits).toBeCloseTo(7, 12)
  })

  it('devastating wounds bypass the save on critical wounds', () => {
    // 6 auto-hits, wound 4+ (crit 1/6, normal 1/3), Sv2+ (fail 1/6)
    // E[unsaved] = 6 * (1/6 + 1/3 * 1/6) = 4/3
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '6',
            keywords: ['Torrent', 'Devastating Wounds'],
          }),
          count: 1,
        },
      ],
      defender({ save: 2, wounds: 10, models: 1 }),
    )
    expect(r.expected.unsaved).toBeCloseTo(4 / 3, 12)
  })

  it('anti-keyword expands the critical wound threshold', () => {
    // S3 v T8 needs 6s, but Anti-infantry 4+ crits (auto-wounds) on 4+
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '6',
            strength: 3,
            keywords: ['Torrent', 'Anti-infantry 4+'],
          }),
          count: 1,
        },
      ],
      defender({
        toughness: 8,
        save: 6,
        wounds: 10,
        models: 1,
        keywords: ['Infantry'],
      }),
    )
    expect(r.expected.wounds).toBeCloseTo(3, 12)
  })

  it('anti-keyword is inert against non-matching targets', () => {
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '6',
            strength: 3,
            keywords: ['Torrent', 'Anti-infantry 4+'],
          }),
          count: 1,
        },
      ],
      defender({
        toughness: 8,
        save: 6,
        wounds: 10,
        models: 1,
        keywords: ['Vehicle'],
      }),
    )
    expect(r.expected.wounds).toBeCloseTo(1, 12)
  })

  it('twin-linked rerolls failed wounds', () => {
    // 6 auto-hits, wound 4+ with reroll: 6 * 3/4 = 4.5
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '6',
            keywords: ['Torrent', 'Twin-linked'],
          }),
          count: 1,
        },
      ],
      defender({}),
    )
    expect(r.expected.wounds).toBeCloseTo(4.5, 12)
  })

  it('feel no pain discounts damage', () => {
    // 1 auto-hit, S8 v T4 (2+), no save, D3, FNP 5+:
    // E[damage] = 5/6 * 3 * 2/3 = 5/3
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '1',
            strength: 8,
            ap: 2,
            damage: '3',
            keywords: ['Torrent'],
          }),
          count: 1,
        },
      ],
      defender({ save: 6, wounds: 10, models: 1, feelNoPain: 5 }),
    )
    expect(r.expected.damage).toBeCloseTo(5 / 3, 6)
  })

  it('melta adds damage at half range', () => {
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '1',
            strength: 8,
            ap: 2,
            damage: 'D6',
            keywords: ['Torrent', 'Melta 2'],
          }),
          count: 1,
        },
      ],
      defender({ save: 6, wounds: 20, models: 1 }),
      { halfRange: true },
    )
    expect(r.expected.damage).toBeCloseTo((5 / 6) * 5.5, 6)
  })

  it('blast adds attacks per 5 models in the target', () => {
    const r = resolveAttacks(
      [{ profile: ranged({ attacks: '2', keywords: ['Blast'] }), count: 3 }],
      defender({ models: 11, wounds: 1 }),
    )
    expect(r.expected.attacks).toBeCloseTo(12, 12)
  })

  it('rapid fire adds attacks at half range', () => {
    const r = resolveAttacks(
      [
        {
          profile: ranged({ attacks: '2', keywords: ['Rapid Fire 1'] }),
          count: 1,
        },
      ],
      defender({}),
      { halfRange: true },
    )
    expect(r.expected.attacks).toBeCloseTo(3, 12)
  })

  it('heavy gives +1 to hit when stationary', () => {
    const r = resolveAttacks(
      [{ profile: ranged({ attacks: '6', keywords: ['Heavy'] }), count: 1 }],
      defender({}),
      { stationary: true },
    )
    // 4+ becomes 3+
    expect(r.expected.hits).toBeCloseTo(4, 12)
  })

  it('lance gives +1 to wound on the charge in melee', () => {
    const melee: WeaponProfileInput = {
      type: 'melee',
      attacks: '6',
      skill: 0,
      strength: 4,
      ap: 0,
      damage: '1',
      keywords: ['Lance'],
    }
    const r = resolveAttacks([{ profile: melee, count: 1 }], defender({}), {
      charged: true,
    })
    // wound 4+ becomes 3+ : 6 * (4/6) = 4 (unmodified 6s still crit)
    expect(r.expected.wounds).toBeCloseTo(4, 12)
  })

  it('hit modifiers are capped at +1', () => {
    const r = resolveAttacks(
      [{ profile: ranged({ attacks: '6' }), count: 1 }],
      defender({}),
      { hitMod: 3 },
    )
    // 4+ with +1 -> 2/3 of 6
    expect(r.expected.hits).toBeCloseTo(4, 12)
  })

  it('damage reduction lowers each wound by 1 to a minimum of 1', () => {
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '1',
            strength: 8,
            ap: 2,
            damage: '2',
            keywords: ['Torrent'],
          }),
          count: 1,
        },
      ],
      defender({ save: 6, wounds: 10, models: 1, damageReduction: 1 }),
    )
    expect(r.expected.damage).toBeCloseTo(5 / 6, 6)
  })
})

describe('attached characters', () => {
  it('allocates to bodyguards before the character, with its own save', () => {
    // 2 auto-hits, S8 v T4 (2+, p=5/6 each); the lone bodyguard has no save
    // (Sv6 vs AP-2), the character saves on 4+ (2+ with AP-2)
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '2',
            strength: 8,
            ap: 2,
            keywords: ['Torrent'],
          }),
          count: 1,
        },
      ],
      defender({
        save: 6,
        wounds: 1,
        models: 1,
        attached: { toughness: 4, save: 2, wounds: 1 },
      }),
    )
    // bodyguard dies to any wound
    expect(r.slain[1]).toBeCloseTo(1 - 1 / 36, 12)
    // character dies only if both attacks wound and its 4+ save fails
    expect(r.attachedSlain).toBeCloseTo((25 / 36) * (1 / 2), 12)
    expect(r.unitKilled).toBeCloseTo(r.attachedSlain!, 12)
  })

  it("applies the character's own feel no pain", () => {
    // same shape, but the character has no save and FNP 4+ instead
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '2',
            strength: 8,
            ap: 2,
            keywords: ['Torrent'],
          }),
          count: 1,
        },
      ],
      defender({
        save: 6,
        wounds: 1,
        models: 1,
        attached: { toughness: 4, save: 6, wounds: 1, feelNoPain: 4 },
      }),
    )
    expect(r.attachedSlain).toBeCloseTo((25 / 36) * (1 / 2), 12)
  })

  it('wound rolls use majority toughness, highest on a tie', () => {
    const char = { toughness: 8, save: 2, wounds: 5 }
    // 1 bodyguard + 1 character: tie -> T8, S4 wounds on 6s
    const tied = resolveAttacks(
      [{ profile: ranged({ attacks: '6', keywords: ['Torrent'] }), count: 1 }],
      defender({ models: 1, wounds: 5, attached: char }),
    )
    expect(tied.expected.wounds).toBeCloseTo(1, 12)
    // 2 bodyguards: majority is T4, S4 wounds on 4+
    const majority = resolveAttacks(
      [{ profile: ranged({ attacks: '6', keywords: ['Torrent'] }), count: 1 }],
      defender({ models: 2, wounds: 5, attached: char }),
    )
    expect(majority.expected.wounds).toBeCloseTo(3, 12)
  })

  it('no attachedSlain reported without a character', () => {
    const r = resolveAttacks(
      [{ profile: ranged({ attacks: '6' }), count: 1 }],
      defender({}),
    )
    expect(r.attachedSlain).toBeUndefined()
  })
})

describe('damage allocation', () => {
  it('loses excess damage when a model dies (no spillover)', () => {
    // 4 wounds of flat damage 2 into 5 models with 3W each:
    // each model takes 2 hits (3 -> 1 -> dead, 1 wasted), so exactly 2 die
    const def = defender({ wounds: 3, models: 5 })
    const state = applyWounds(initialState(def), certain(4), certain(2), def)
    expect(state.live[2][3]).toBeCloseTo(1, 12)
    expect(state.dead).toBe(0)
  })

  it('big single damage kills one model per wound', () => {
    // damage 6 vs W3 models: every wound kills exactly one model
    const def = defender({ wounds: 3, models: 3 })
    const state = applyWounds(initialState(def), certain(2), certain(6), def)
    expect(state.live[2][3]).toBeCloseTo(1, 12)
  })

  it('reports unit destruction probability', () => {
    // 10 auto-hits, wound 2+, no save, D1 vs 1 model with 1W:
    // survives only if all 10 fail to wound: (1/6)^10
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '10',
            strength: 8,
            ap: 2,
            keywords: ['Torrent'],
          }),
          count: 1,
        },
      ],
      defender({ save: 6, wounds: 1, models: 1 }),
    )
    expect(r.unitKilled).toBeCloseTo(1 - Math.pow(1 / 6, 10), 10)
    expect(r.slain[1]).toBeCloseTo(r.unitKilled, 12)
  })

  it('slain distribution sums to 1', () => {
    const r = resolveAttacks(
      [
        {
          profile: ranged({ attacks: '2D6', skill: 3, damage: 'D3' }),
          count: 4,
        },
      ],
      defender({}),
    )
    const total = r.slain.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 9)
    const totalDmg = r.damage.reduce((a, b) => a + b, 0)
    expect(totalDmg).toBeCloseTo(1, 9)
  })

  it('multi-weapon attacks resolve sequentially through the same pool', () => {
    // two weapons, each one auto-hit auto-ish wound: certain kills require
    // exact tracking across profiles
    const def = defender({ wounds: 4, models: 1, save: 6 })
    const r = resolveAttacks(
      [
        {
          profile: ranged({
            attacks: '1',
            strength: 8,
            ap: 2,
            damage: '3',
            keywords: ['Torrent'],
          }),
          count: 1,
        },
        {
          profile: ranged({
            attacks: '1',
            strength: 8,
            ap: 2,
            damage: '3',
            keywords: ['Torrent'],
          }),
          count: 1,
        },
      ],
      def,
    )
    // P(both wound) = (5/6)^2 kills the model (3+3 >= 4W)
    expect(r.unitKilled).toBeCloseTo((5 / 6) * (5 / 6), 12)
    // one wound alone leaves it alive on 1W; expected effective damage:
    // P(2 wounds)*4 + P(1 wound)*3
    const pBoth = 25 / 36
    const pOne = 2 * (5 / 6) * (1 / 6)
    expect(r.expected.damage).toBeCloseTo(pBoth * 4 + pOne * 3, 9)
  })
})
