import { describe, expect, it } from 'vitest'
import { expectation } from './dist.ts'
import { parseKeywords } from './keywords.ts'

describe('parseKeywords', () => {
  it('parses boolean keywords case-insensitively', () => {
    const kw = parseKeywords([
      'Torrent',
      'lethal hits',
      'Devastating Wounds',
      'Twin-linked',
      'Blast',
      'Heavy',
      'Lance',
      'Ignores Cover',
      'Hazardous',
    ])
    expect(kw.torrent).toBe(true)
    expect(kw.lethalHits).toBe(true)
    expect(kw.devastatingWounds).toBe(true)
    expect(kw.twinLinked).toBe(true)
    expect(kw.blast).toBe(true)
    expect(kw.heavy).toBe(true)
    expect(kw.lance).toBe(true)
    expect(kw.ignoresCover).toBe(true)
    expect(kw.hazardous).toBe(true)
    expect(kw.other).toEqual([])
  })

  it('parses valued keywords', () => {
    const kw = parseKeywords(['Sustained Hits 2', 'Rapid Fire 1', 'Melta 2'])
    expect(expectation(kw.sustainedHits!)).toBe(2)
    expect(expectation(kw.rapidFire!)).toBe(1)
    expect(expectation(kw.melta!)).toBe(2)
  })

  it('parses dice-valued sustained hits', () => {
    const kw = parseKeywords(['Sustained Hits D3'])
    expect(expectation(kw.sustainedHits!)).toBe(2)
  })

  it('parses anti keywords', () => {
    const kw = parseKeywords(['Anti-fly 2+', 'Anti-VEHICLE 4+'])
    expect(kw.anti).toEqual([
      { keyword: 'fly', threshold: 2 },
      { keyword: 'vehicle', threshold: 4 },
    ])
  })

  it('collects unknown keywords as other', () => {
    const kw = parseKeywords(['Pistol', 'Assault', 'Precision', 'One Shot'])
    expect(kw.other).toEqual(['Pistol', 'Assault', 'Precision', 'One Shot'])
  })
})
