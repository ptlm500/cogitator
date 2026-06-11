import { describe, expect, it } from 'vitest'
import { parseState, serializeState, type SharedState } from './urlState.ts'

describe('urlState', () => {
  it('round-trips a full state', () => {
    const state: SharedState = {
      attackerFaction: 'imperium-adeptus-astartes-space-marines.json',
      attackerUnitId: 'abc-123',
      attackerCharIds: ['char-1', 'char-9'],
      mode: 'melee',
      counts: { 'w1:0': 5, 'w2:1': 0 },
      skills: { 'w1:0': 2 },
      defenderFaction: 'chaos-death-guard.json',
      defenderUnitId: 'def-456',
      defenderCharIds: ['char-2'],
      groupOrder: ['stat-2', 'stat-1'],
      modelCounts: { 'stat-1': 7, 'stat-2': 2 },
      context: {
        halfRange: true,
        inCover: true,
        hitMod: 1,
        woundMod: -1,
        rerollHits: 'ones',
        rerollWounds: 'fails',
        critHitOn: 5,
      },
      overrides: { invuln: 4, feelNoPain: 'none', damageReduction: true },
    }
    expect(parseState(serializeState(state))).toEqual(state)
  })

  it('round-trips a minimal state', () => {
    const state: SharedState = {
      attackerFaction: 'orks.json',
      attackerUnitId: 'u1',
    }
    expect(parseState(serializeState(state))).toEqual(state)
    expect(serializeState(state)).not.toContain('m=')
  })

  it('reads a plain-number dm as legacy total models', () => {
    const s = parseState('du=u1&dm=10')
    expect(s.legacyModels).toBe(10)
    expect(s.modelCounts).toBeUndefined()
  })

  it('parses an empty hash to an empty state', () => {
    expect(parseState('')).toEqual({})
    expect(parseState('#')).toEqual({})
  })

  it('ignores malformed numeric values', () => {
    const s = parseState('hm=7&dm=xyz&ch=4')
    expect(s.context).toBeUndefined()
    expect(s.modelCounts).toBeUndefined()
    expect(s.legacyModels).toBeUndefined()
  })
})
