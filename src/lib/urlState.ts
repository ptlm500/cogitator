import type { AttackContext, RerollMode } from '@/rules/types.ts'
import type { AttackMode, DefenderOverrides } from './simulation.ts'

/** Everything needed to reconstruct the calculator's state from a URL */
export interface SharedState {
  /** Omitted from the URL for the default edition (10e) */
  edition?: string
  attackerFaction?: string
  attackerUnitId?: string
  attackerCharIds?: string[]
  mode?: AttackMode
  /** Weapon counts that differ from the default loadout */
  counts?: Record<string, number>
  /** Per-row BS/WS characteristic overrides */
  skills?: Record<string, number>
  /** Per-row Attacks characteristic modifiers */
  attackBonus?: Record<string, number>
  /** Per-row granted ability codes */
  extras?: Record<string, string[]>
  defenderFaction?: string
  defenderUnitId?: string
  defenderCharIds?: string[]
  /** Defense-group allocation order (group ids) */
  groupOrder?: string[]
  /** Model count per statline id */
  modelCounts?: Record<string, number>
  /** Total model count from pre-mixed-statline URLs */
  legacyModels?: number
  context?: AttackContext
  overrides?: DefenderOverrides
}

const SITUATION_FLAGS: [keyof AttackContext, string][] = [
  ['halfRange', 'h'],
  ['stationary', 's'],
  ['charged', 'c'],
  ['inCover', 'v'],
  ['engaged', 'e'],
  ['indirectFire', 'i'],
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
  if (state.attackerCharIds && state.attackerCharIds.length > 0) {
    set('ac', state.attackerCharIds.join(','))
  }
  if (state.mode === 'melee') set('m', 'melee')
  const counts = Object.entries(state.counts ?? {})
  if (counts.length > 0) {
    set('wc', counts.map(([k, v]) => `${k}:${v}`).join(','))
  }
  const skills = Object.entries(state.skills ?? {})
  if (skills.length > 0) {
    set('sk', skills.map(([k, v]) => `${k}:${v}`).join(','))
  }
  const attackBonus = Object.entries(state.attackBonus ?? {})
  if (attackBonus.length > 0) {
    set('ab', attackBonus.map(([k, v]) => `${k}:${v}`).join(','))
  }
  const extras = Object.entries(state.extras ?? {}).filter(
    ([, codes]) => codes.length > 0,
  )
  if (extras.length > 0) {
    set('xk', extras.map(([k, codes]) => `${k}:${codes.join('.')}`).join(','))
  }
  set('df', state.defenderFaction)
  set('du', state.defenderUnitId)
  if (state.defenderCharIds && state.defenderCharIds.length > 0) {
    set('dc', state.defenderCharIds.join(','))
  }
  if (state.groupOrder && state.groupOrder.length > 0) {
    set('go', state.groupOrder.join(','))
  }
  const modelCounts = Object.entries(state.modelCounts ?? {})
  if (modelCounts.length > 0) {
    set('dm', modelCounts.map(([k, v]) => `${k}:${v}`).join(','))
  }

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
  const ac = p.get('ac')
  if (ac) state.attackerCharIds = ac.split(',').filter(Boolean)
  if (p.get('m') === 'melee') state.mode = 'melee'
  const parseKeyedNumbers = (raw: string | null) => {
    if (!raw) return undefined
    const out: Record<string, number> = {}
    for (const entry of raw.split(',')) {
      const i = entry.lastIndexOf(':')
      if (i <= 0) continue
      const value = Number(entry.slice(i + 1))
      if (Number.isFinite(value)) out[entry.slice(0, i)] = value
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  state.counts = parseKeyedNumbers(p.get('wc'))
  state.skills = parseKeyedNumbers(p.get('sk'))
  state.attackBonus = parseKeyedNumbers(p.get('ab'))
  const xk = p.get('xk')
  if (xk) {
    const extras: Record<string, string[]> = {}
    for (const entry of xk.split(',')) {
      const i = entry.lastIndexOf(':')
      if (i <= 0) continue
      const codes = entry
        .slice(i + 1)
        .split('.')
        .filter(Boolean)
      if (codes.length > 0) extras[entry.slice(0, i)] = codes
    }
    if (Object.keys(extras).length > 0) state.extras = extras
  }
  state.defenderFaction = get('df')
  state.defenderUnitId = get('du')
  const dc = p.get('dc')
  if (dc) state.defenderCharIds = dc.split(',').filter(Boolean)
  const go = p.get('go')
  if (go) state.groupOrder = go.split(',').filter(Boolean)
  const dm = p.get('dm')
  if (dm !== null && dm.includes(':')) {
    state.modelCounts = parseKeyedNumbers(dm)
  } else if (dm !== null && Number.isFinite(Number(dm))) {
    state.legacyModels = Number(dm)
  }

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
