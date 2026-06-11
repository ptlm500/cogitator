import { describe, expect, it } from 'vitest'
import { parseDice } from './dice.ts'
import { applyDamageReroll, rollOutcomes, strongerReroll } from './sequence.ts'

const sum = (d: number[]) => d.reduce((a, b) => a + b, 0)
const mean = (d: number[]) => d.reduce((e, p, v) => e + p * v, 0)

describe('rollOutcomes noncrits (crit fishing)', () => {
  it('keeps crits and re-rolls everything else', () => {
    // 3+ to hit, crits on 5+: base miss 2/6, hit 2/6, crit 2/6
    const o = rollOutcomes(3, 0, 5, 'noncrits')
    // kept crits + 4/6 re-rolled mass landing on each outcome
    expect(o.crit).toBeCloseTo(2 / 6 + (4 / 6) * (2 / 6), 12)
    expect(o.hit).toBeCloseTo((4 / 6) * (2 / 6), 12)
    expect(o.miss).toBeCloseTo((4 / 6) * (2 / 6), 12)
    expect(o.miss + o.hit + o.crit).toBeCloseTo(1, 12)
  })

  it('raises crits but lowers total successes vs re-rolling fails', () => {
    const fish = rollOutcomes(3, 0, 6, 'noncrits')
    const fails = rollOutcomes(3, 0, 6, 'fails')
    expect(fish.crit).toBeGreaterThan(fails.crit)
    expect(fish.hit + fish.crit).toBeLessThan(fails.hit + fails.crit)
  })
})

describe('strongerReroll', () => {
  it('picks the wider grant', () => {
    expect(strongerReroll('fails', 'ones')).toBe('fails')
    expect(strongerReroll('ones', 'fails')).toBe('fails')
    expect(strongerReroll('noncrits', 'fails')).toBe('noncrits')
    expect(strongerReroll('none', 'none')).toBe('none')
  })
})

describe('applyDamageReroll', () => {
  it('ones redistributes the mass at 1', () => {
    const d = applyDamageReroll(parseDice('D6'), 'ones')
    expect(sum(d)).toBeCloseTo(1, 12)
    expect(d[1]).toBeCloseTo(1 / 36, 12)
    expect(d[6]).toBeCloseTo(1 / 6 + 1 / 36, 12)
    expect(mean(d)).toBeCloseTo(3.5 + (1 / 6) * 2.5, 12)
  })

  it('ones is a no-op when a total of 1 cannot occur', () => {
    const base = parseDice('D6+1')
    expect(applyDamageReroll(base, 'ones')).toEqual(base)
  })

  it('all re-rolls results below the mean', () => {
    // D6: re-roll 1-3, keep 4-6 -> E = 2.5 + 0.5 * 3.5 = 4.25
    const d = applyDamageReroll(parseDice('D6'), 'all')
    expect(sum(d)).toBeCloseTo(1, 12)
    expect(mean(d)).toBeCloseTo(4.25, 12)
  })

  it('all is a no-op on flat damage', () => {
    const base = parseDice('3')
    expect(applyDamageReroll(base, 'all')).toEqual(base)
  })

  it('none returns the distribution unchanged', () => {
    const base = parseDice('D6')
    expect(applyDamageReroll(base, 'none')).toBe(base)
  })
})
