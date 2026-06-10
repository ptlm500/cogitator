import type { AttackContext, RerollMode } from '@/rules/types.ts'
import type { AttackMode, DefenderOverrides } from './simulation.ts'

/** Everything needed to reconstruct the calculator's state from a URL */
export interface SharedState {
  /** Omitted from the URL for the default edition (10e) */
  edition?: string
  attackerFaction?: string
  attackerUnitId?: string
  mode?: AttackMode
  /** Weapon counts that differ from the default loadout */
  counts?: Record<string, number>
  defenderFaction?: string
  defenderUnitId?: string
  statlineId?: string
  models?: number
  context?: AttackContext
  overrides?: DefenderOverrides
}

const SITUATION_FLAGS: [keyof AttackContext, string][] = [
  ['halfRange', 'h'],
  ['stationary', 's'],
  ['charged', 'c'],
  ['inCover', 'v'],
]

const REROLLS: RerollMode[] = ['none', 'ones', 'fails']

const saveValue = (v: number | 'none' | undefined): string | undefined =>
  v === undefined ? undefined : v === 'none' ? '0' : String(v)

const parseSave = (s: string | null): number | 'none' | undefined =>
  s === null ? undefined : s === '0' ? 'none' : Number(s)

export function serializeState(state: SharedState): string {
  const p = new URLSearchParams()
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') p.set(key, String(value))
  }
  if (state.edition && state.edition !== '10e') set('ed', state.edition)
  set('af', state.attackerFaction)
  set('au', state.attackerUnitId)
  if (state.mode === 'melee') set('m', 'melee')
  const counts = Object.entries(state.counts ?? {})
  if (counts.length > 0) {
    set('wc', counts.map(([k, v]) => `${k}:${v}`).join(','))
  }
  set('df', state.defenderFaction)
  set('du', state.defenderUnitId)
  set('ds', state.statlineId)
  set('dm', state.models)

  const ctx = state.context ?? {}
  const flags = SITUATION_FLAGS.filter(([k]) => ctx[k])
    .map(([, f]) => f)
    .join('')
  set('sit', flags || undefined)
  if (ctx.hitMod) set('hm', ctx.hitMod)
  if (ctx.woundMod) set('wm', ctx.woundMod)
  if (ctx.rerollHits && ctx.rerollHits !== 'none') set('rh', ctx.rerollHits)
  if (ctx.rerollWounds && ctx.rerollWounds !== 'none')
    set('rw', ctx.rerollWounds)
  if (ctx.critHitOn && ctx.critHitOn !== 6) set('ch', ctx.critHitOn)

  const ovr = state.overrides ?? {}
  set('iv', saveValue(ovr.invuln))
  set('fn', saveValue(ovr.feelNoPain))
  if (ovr.damageReduction) set('dr', 1)
  return p.toString()
}

export function parseState(hash: string): SharedState {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const state: SharedState = {}
  const get = (key: string) => p.get(key) ?? undefined

  state.edition = get('ed')
  state.attackerFaction = get('af')
  state.attackerUnitId = get('au')
  if (p.get('m') === 'melee') state.mode = 'melee'
  const wc = p.get('wc')
  if (wc) {
    state.counts = {}
    for (const entry of wc.split(',')) {
      const i = entry.lastIndexOf(':')
      if (i <= 0) continue
      const count = Number(entry.slice(i + 1))
      if (Number.isFinite(count)) state.counts[entry.slice(0, i)] = count
    }
  }
  state.defenderFaction = get('df')
  state.defenderUnitId = get('du')
  state.statlineId = get('ds')
  const dm = p.get('dm')
  if (dm !== null && Number.isFinite(Number(dm))) state.models = Number(dm)

  const context: AttackContext = {}
  const sit = p.get('sit') ?? ''
  for (const [key, flag] of SITUATION_FLAGS) {
    if (sit.includes(flag)) context[key] = true as never
  }
  const hm = Number(p.get('hm'))
  if (hm === 1 || hm === -1) context.hitMod = hm
  const wm = Number(p.get('wm'))
  if (wm === 1 || wm === -1) context.woundMod = wm
  const rh = p.get('rh') as RerollMode | null
  if (rh && REROLLS.includes(rh)) context.rerollHits = rh
  const rw = p.get('rw') as RerollMode | null
  if (rw && REROLLS.includes(rw)) context.rerollWounds = rw
  if (p.get('ch') === '5') context.critHitOn = 5
  if (Object.keys(context).length > 0) state.context = context

  const overrides: DefenderOverrides = {}
  const iv = parseSave(p.get('iv'))
  if (iv !== undefined) overrides.invuln = iv
  const fn = parseSave(p.get('fn'))
  if (fn !== undefined) overrides.feelNoPain = fn
  if (p.get('dr') === '1') overrides.damageReduction = true
  if (Object.keys(overrides).length > 0) state.overrides = overrides

  return state
}
