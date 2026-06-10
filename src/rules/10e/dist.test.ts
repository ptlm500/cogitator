import { describe, expect, it } from 'vitest'
import {
  atLeast,
  binomial,
  certain,
  compound,
  convolve,
  convolvePower,
  expectation,
  mapValues,
  mix,
} from './dist.ts'
import { parseDice } from './dice.ts'

describe('dist', () => {
  it('certain', () => {
    expect(certain(3)).toEqual([0, 0, 0, 1])
  })

  it('convolve sums independent values', () => {
    const coin = [0.5, 0.5]
    expect(convolve(coin, coin)).toEqual([0.25, 0.5, 0.25])
  })

  it('convolvePower is repeated convolution', () => {
    const d6 = parseDice('D6')
    const two = convolvePower(d6, 2)
    expect(expectation(two)).toBeCloseTo(7, 12)
    expect(two[2]).toBeCloseTo(1 / 36, 12)
    expect(two[7]).toBeCloseTo(6 / 36, 12)
  })

  it('binomial matches closed form', () => {
    const b = binomial(3, 1 / 3)
    expect(b[0]).toBeCloseTo(8 / 27, 12)
    expect(b[1]).toBeCloseTo(12 / 27, 12)
    expect(b[2]).toBeCloseTo(6 / 27, 12)
    expect(b[3]).toBeCloseTo(1 / 27, 12)
  })

  it('compound: sum of N coins where N ~ d3', () => {
    const d3 = parseDice('D3')
    const coin = [0.5, 0.5]
    const c = compound(d3, coin)
    // E = E[N] * E[coin] = 2 * 0.5
    expect(expectation(c)).toBeCloseTo(1, 12)
    // P(3) = P(N=3) * 1/8
    expect(c[3]).toBeCloseTo((1 / 3) * (1 / 8), 12)
  })

  it('mix weights distributions', () => {
    const m = mix([
      { dist: certain(0), weight: 0.25 },
      { dist: certain(2), weight: 0.75 },
    ])
    expect(m).toEqual([0.25, 0, 0.75])
  })

  it('mapValues remaps and merges', () => {
    const d = mapValues([0.2, 0.3, 0.5], (v) =>
      v > 0 ? Math.max(1, v - 1) : 0,
    )
    expect(d[0]).toBeCloseTo(0.2, 12)
    expect(d[1]).toBeCloseTo(0.8, 12)
  })

  it('atLeast sums the tail', () => {
    expect(atLeast([0.1, 0.2, 0.3, 0.4], 2)).toBeCloseTo(0.7, 12)
  })
})

describe('parseDice', () => {
  it('parses flat values', () => {
    expect(parseDice('2')).toEqual([0, 0, 1])
  })

  it('parses D6', () => {
    expect(expectation(parseDice('D6'))).toBeCloseTo(3.5, 12)
  })

  it('parses D3', () => {
    expect(expectation(parseDice('D3'))).toBeCloseTo(2, 12)
  })

  it('parses 2D6', () => {
    expect(expectation(parseDice('2D6'))).toBeCloseTo(7, 12)
  })

  it('parses D6+2', () => {
    const d = parseDice('D6+2')
    expect(d[0]).toBe(0)
    expect(d[3]).toBeCloseTo(1 / 6, 12)
    expect(expectation(d)).toBeCloseTo(5.5, 12)
  })

  it('parses 2D3+1', () => {
    expect(expectation(parseDice('2D3+1'))).toBeCloseTo(5, 12)
  })

  it('throws on garbage', () => {
    expect(() => parseDice('N/A')).toThrow()
  })
})
