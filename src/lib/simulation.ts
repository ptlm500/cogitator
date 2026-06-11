import type { Unit, UnitSize, WeaponProfile } from '@/data/types.ts'
import type {
  AttackContext,
  AttackResult,
  DamageRerollMode,
  DefenderInput,
  DefenderSegment,
  RerollMode,
  WeaponInput,
  WeaponProfileInput,
} from '@/rules/types.ts'
import { engines } from '@/rules/index.ts'
import { extraKeywords } from './weaponExtras.ts'

export type AttackMode = 'shooting' | 'melee'

/** One editable row in the attacker's weapon table */
export interface ProfileRow {
  key: string
  weaponName: string
  profile: WeaponProfile
  defaultCount: number
  maxCount: number
}

/** The unit-size option in effect: the requested one, else the first */
export function sizeFor(unit: Unit, sizeId?: string): UnitSize | undefined {
  if (!unit.sizes || unit.sizes.length === 0) return undefined
  return unit.sizes.find((s) => s.id === sizeId) ?? unit.sizes[0]
}

/**
 * Default number of each model entry in a unit. With a unit-size option the
 * counts come straight from its standard composition. Otherwise entries
 * with a minimum use it; if that leaves a one-model unit with optional
 * members (common for squads whose members are all "0 to N of..." entries),
 * the entry with the largest cap is filled to it, approximating the
 * standard squad.
 */
export function defaultModelCounts(
  unit: Unit,
  sizeId?: string,
): Record<string, number> {
  const size = sizeFor(unit, sizeId)
  if (size) {
    return Object.fromEntries(
      unit.models.map((m) => [m.id, size.models[m.id]?.default ?? 0]),
    )
  }
  const counts: Record<string, number> = {}
  for (const m of unit.models) counts[m.id] = m.min
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const optional = unit.models.filter((m) => m.min === 0)
  if (total <= 1 && optional.length > 0) {
    const basic = optional.reduce((a, b) => (b.max > a.max ? b : a))
    counts[basic.id] = basic.max
  }
  return counts
}

/** Total models in the default configuration (at least 1) */
export function defaultUnitSize(unit: Unit): number {
  const counts = defaultModelCounts(unit)
  return Math.max(
    1,
    Object.values(counts).reduce((a, b) => a + b, 0),
  )
}

const profileMatchesMode = (p: WeaponProfile, mode: AttackMode) =>
  mode === 'shooting' ? p.type === 'ranged' : p.type === 'melee'

/**
 * The weapon profile rows a unit can attack with in the given mode, with
 * default counts derived from the default model configuration. Weapons
 * with several profiles in the same mode (e.g. plasma standard/supercharge)
 * default to the first profile only.
 */
export function profileRows(
  unit: Unit,
  mode: AttackMode,
  sizeId?: string,
): ProfileRow[] {
  const size = sizeFor(unit, sizeId)
  const modelCounts = defaultModelCounts(unit, sizeId)
  const defaults = new Map<string, number>()
  const maxes = new Map<string, number>()
  for (const model of unit.models) {
    const n = modelCounts[model.id]
    const modelMax = size ? (size.models[model.id]?.max ?? 0) : model.max
    for (const ref of model.weapons) {
      defaults.set(
        ref.weaponId,
        (defaults.get(ref.weaponId) ?? 0) + n * ref.defaultCount,
      )
      maxes.set(
        ref.weaponId,
        (maxes.get(ref.weaponId) ?? 0) + modelMax * ref.max,
      )
    }
  }
  for (const ref of unit.looseWeapons) {
    defaults.set(
      ref.weaponId,
      (defaults.get(ref.weaponId) ?? 0) + ref.defaultCount,
    )
    maxes.set(ref.weaponId, (maxes.get(ref.weaponId) ?? 0) + ref.max)
  }

  const rows: ProfileRow[] = []
  for (const weapon of Object.values(unit.weapons)) {
    const matching = weapon.profiles.filter((p) => profileMatchesMode(p, mode))
    matching.forEach((profile, i) => {
      const def = i === 0 ? (defaults.get(weapon.id) ?? 0) : 0
      let max = Math.max(maxes.get(weapon.id) ?? 0, def)
      // unit-wide weapon caps that depend on the chosen size
      const cap = size?.weapons?.[weapon.id]
      if (cap !== undefined) max = Math.min(max, cap)
      // with explicit size options a weapon can be unavailable at this size
      if (size && max === 0) return
      rows.push({
        key: `${weapon.id}:${weapon.profiles.indexOf(profile)}`,
        weaponName: weapon.name,
        profile,
        defaultCount: Math.min(def, max),
        maxCount: Math.max(max, 1),
      })
    })
  }
  rows.sort(
    (a, b) =>
      b.defaultCount - a.defaultCount ||
      a.weaponName.localeCompare(b.weaponName),
  )
  return rows
}

/** A cap on the combined count of several weapon rows, derived from a
 * unit-size pool (e.g. "up to 2 special weapons per 10 models") */
export interface RowPool {
  label: string
  max: number
  keys: string[]
}

/**
 * Translate the active size's model pools into weapon-row caps: a row joins
 * a pool when every model that can carry that weapon (at this size) belongs
 * to the pool, so its counts spend the pool's budget.
 */
export function rowPools(
  unit: Unit,
  mode: AttackMode,
  sizeId?: string,
): RowPool[] {
  const size = sizeFor(unit, sizeId)
  if (!size?.pools || size.pools.length === 0) return []
  const contributors = new Map<string, Set<string>>()
  for (const model of unit.models) {
    if ((size.models[model.id]?.max ?? 0) === 0) continue
    for (const ref of model.weapons) {
      if (ref.max <= 0) continue
      let set = contributors.get(ref.weaponId)
      if (!set) {
        set = new Set()
        contributors.set(ref.weaponId, set)
      }
      set.add(model.id)
    }
  }
  const rows = profileRows(unit, mode, sizeId)
  return (
    size.pools
      .map((pool) => {
        const ids = new Set(pool.modelIds)
        const inPool = rows.filter((r) => {
          const weaponId = r.key.slice(0, r.key.lastIndexOf(':'))
          const carriers = contributors.get(weaponId)
          return (
            carriers !== undefined &&
            carriers.size > 0 &&
            [...carriers].every((id) => ids.has(id))
          )
        })
        return {
          label: pool.label,
          max: pool.max,
          keys: inPool.map((r) => r.key),
          capacity: inPool.reduce((sum, r) => sum + r.maxCount, 0),
        }
      })
      // a pool only matters when its rows could exceed the budget; weapons
      // also carried by models outside the pool (the Long-quill's Kroot
      // rifle) fall out of the mapping, which can leave a budget that
      // nothing meaningful spends — showing it would just confuse
      .filter((p) => p.keys.length > 0 && p.capacity > p.max)
      .map((p) => ({ label: p.label, max: p.max, keys: p.keys }))
  )
}

/** Manual overrides for defender traits; undefined means "from data" */
export interface DefenderOverrides {
  invuln?: number | 'none'
  feelNoPain?: number | 'none'
  damageReduction?: boolean
}

export interface DefenderConfig {
  unit: Unit
  /** Model count per statline id; segments take hits in statline order */
  modelCounts: Record<string, number>
  /** Defense-group allocation order (group ids); defaults to data order */
  groupOrder?: string[]
  /** Per-group Toughness overrides (by group id) */
  groupToughness?: Record<string, number>
  /** Per-group Save overrides (by group id) */
  groupSave?: Record<string, number>
  /** Per-group Wounds overrides (by group id) */
  groupWounds?: Record<string, number>
  /** Characters attached to the unit (allocated to last, in this order) */
  attachedUnits?: Unit[]
  overrides?: DefenderOverrides
}

function override(
  manual: number | 'none' | undefined,
  fromData: number | undefined,
): number | undefined {
  if (manual === 'none') return undefined
  return manual ?? fromData
}

/** A group of statlines with identical defensive characteristics; data
 * sometimes repeats the same statline per model entry, so the defender UI
 * and engine segments work on these merged groups. */
export interface DefenseGroup {
  /** First statline id of the group (stable key for state and URLs) */
  id: string
  name: string
  T: number
  SV: number
  W: number
  OC: number
  max: number
  defaultCount: number
}

export function defenseGroups(unit: Unit, sizeId?: string): DefenseGroup[] {
  const size = sizeFor(unit, sizeId)
  const modelDefaults = defaultModelCounts(unit, sizeId)
  const byKey = new Map<string, DefenseGroup & { ids: Set<string> }>()
  for (const s of unit.statlines) {
    const key = `${s.T}|${s.SV}|${s.W}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        id: s.id,
        name: s.name,
        T: s.T,
        SV: s.SV,
        W: s.W,
        OC: s.OC,
        max: 0,
        defaultCount: 0,
        ids: new Set(),
      }
      byKey.set(key, group)
    }
    group.ids.add(s.id)
  }
  const groups = [...byKey.values()]
  for (const m of unit.models) {
    const group = groups.find((g) => g.ids.has(m.statlineId))
    if (group) {
      group.max += size ? (size.models[m.id]?.max ?? 0) : m.max
      group.defaultCount += modelDefaults[m.id]
    }
  }
  const total = groups.reduce((sum, g) => sum + g.defaultCount, 0)
  if (total === 0 && groups[0]) groups[0].defaultCount = 1
  for (const g of groups) {
    // optional specialists can't push the unit past its composition size
    if (size && total > 0) g.max = Math.min(g.max, total)
    g.max = Math.max(g.max, g.defaultCount, 1)
  }
  return groups.map((g) => {
    const { ids, ...rest } = g
    void ids
    return rest
  })
}

/** Order groups by an explicit id order, unknown ids keeping data order */
function orderGroups(
  groups: DefenseGroup[],
  order: string[] | undefined,
): DefenseGroup[] {
  if (!order || order.length === 0) return groups
  const index = new Map(order.map((id, i) => [id, i]))
  return [...groups].sort(
    (a, b) =>
      (index.get(a.id) ?? order.length) - (index.get(b.id) ?? order.length),
  )
}

export function toDefenderInput(config: DefenderConfig): DefenderInput {
  const overrides = config.overrides ?? {}
  const groups = orderGroups(defenseGroups(config.unit), config.groupOrder)
  const segmentFor = (g: DefenseGroup, models: number): DefenderSegment => ({
    models,
    toughness: config.groupToughness?.[g.id] ?? g.T,
    save: config.groupSave?.[g.id] ?? g.SV,
    wounds: Math.max(1, config.groupWounds?.[g.id] ?? g.W),
    invuln: override(overrides.invuln, config.unit.invuln),
    feelNoPain: override(overrides.feelNoPain, config.unit.feelNoPain),
  })
  const segments: DefenderSegment[] = groups
    .filter((g) => (config.modelCounts[g.id] ?? 0) > 0)
    .map((g) => segmentFor(g, config.modelCounts[g.id]))
  if (segments.length === 0 && groups[0]) {
    segments.push(segmentFor(groups[0], 1))
  }
  const input: DefenderInput = {
    segments,
    damageReduction: overrides.damageReduction ? 1 : 0,
    keywords: config.unit.keywords,
  }
  const chars = (config.attachedUnits ?? []).filter(
    (c) => c.statlines.length > 0,
  )
  if (chars.length > 0) {
    for (const char of chars) {
      const charStat = char.statlines[0]
      segments.push({
        models: 1,
        toughness: charStat.T,
        save: charStat.SV,
        wounds: Math.max(1, charStat.W),
        invuln: override(overrides.invuln, char.invuln),
        feelNoPain: override(overrides.feelNoPain, char.feelNoPain),
        isCharacter: true,
      })
    }
    // Anti-X matches against the combined unit's keywords
    input.keywords = [
      ...new Set([
        ...config.unit.keywords,
        ...chars.flatMap((c) => c.keywords),
      ]),
    ]
  }
  return input
}

/** Units that can be attached as leaders (10e Character keyword) */
export function characterUnits(units: Unit[]): Unit[] {
  return units.filter((u) => u.keywords.includes('Character'))
}

/** One defender model slot in allocation order, for visualisation */
export interface ModelSlot {
  wounds: number
  isCharacter: boolean
}

/** The defender's models in allocation order (front takes hits first) */
export function defenderModelLayout(config: DefenderConfig): ModelSlot[] {
  return toDefenderInput(config).segments.flatMap((s) =>
    Array.from({ length: s.models }, () => ({
      wounds: Math.max(1, s.wounds),
      isCharacter: Boolean(s.isCharacter),
    })),
  )
}

/** Per-weapon-row manual overrides (deltas from the datasheet) */
export interface RowOverrides {
  counts: Record<string, number>
  /** BS/WS characteristic overrides (stack with roll modifiers) */
  skills?: Record<string, number>
  /** Attacks characteristic modifier (min 1 after applying) */
  attackBonus?: Record<string, number>
  /** Strength characteristic overrides */
  strength?: Record<string, number>
  /** AP overrides (non-negative, AP -1 stored as 1) */
  ap?: Record<string, number>
  /** Damage characteristic modifier (min 1 after applying) */
  damageBonus?: Record<string, number>
  /** Granted ability codes (see weaponExtras.ts) */
  extras?: Record<string, string[]>
  /** Per-row re-rolls; set values take precedence over the global
   * AttackContext settings, absent rows inherit them */
  rerollHits?: Record<string, RerollMode>
  rerollWounds?: Record<string, RerollMode>
  rerollDamage?: Record<string, DamageRerollMode>
}

export function runSimulation(
  edition: string,
  rows: ProfileRow[],
  overrides: RowOverrides,
  defender: DefenderConfig,
  context: AttackContext,
): AttackResult | undefined {
  const engine = engines[edition]
  if (!engine) return undefined
  const weapons: WeaponInput[] = rows
    .map((row) => {
      let profile: WeaponProfileInput = row.profile
      const skill = overrides.skills?.[row.key]
      const strength = overrides.strength?.[row.key]
      const ap = overrides.ap?.[row.key]
      const attackBonus = overrides.attackBonus?.[row.key]
      const damageBonus = overrides.damageBonus?.[row.key]
      const codes = overrides.extras?.[row.key]
      const rerollHits = overrides.rerollHits?.[row.key]
      const rerollWounds = overrides.rerollWounds?.[row.key]
      const rerollDamage = overrides.rerollDamage?.[row.key]
      if (
        (skill !== undefined && profile.skill > 0) ||
        strength !== undefined ||
        ap !== undefined ||
        attackBonus ||
        damageBonus ||
        rerollHits !== undefined ||
        rerollWounds !== undefined ||
        rerollDamage !== undefined ||
        (codes && codes.length > 0)
      ) {
        profile = {
          ...profile,
          skill:
            skill !== undefined && profile.skill > 0 ? skill : profile.skill,
          strength: strength ?? profile.strength,
          ap: ap ?? profile.ap,
          attacksBonus: attackBonus,
          damageBonus,
          rerollHits,
          rerollWounds,
          rerollDamage,
          keywords: codes?.length
            ? [...profile.keywords, ...extraKeywords(codes)]
            : profile.keywords,
        }
      }
      return { profile, count: overrides.counts[row.key] ?? 0 }
    })
    .filter((w) => w.count > 0)
  return engine.resolveAttacks(weapons, toDefenderInput(defender), context)
}
