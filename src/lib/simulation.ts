import type { Unit, WeaponProfile } from '@/data/types.ts'
import type {
  AttackContext,
  AttackResult,
  DefenderInput,
  DefenderSegment,
  WeaponInput,
} from '@/rules/types.ts'
import { engines } from '@/rules/index.ts'

export type AttackMode = 'shooting' | 'melee'

/** One editable row in the attacker's weapon table */
export interface ProfileRow {
  key: string
  weaponName: string
  profile: WeaponProfile
  defaultCount: number
  maxCount: number
}

/**
 * Default number of each model entry in a unit. Entries with a minimum use
 * it; if that leaves a one-model unit with optional members (common for
 * squads whose members are all "0 to N of..." entries), the entry with the
 * largest cap is filled to it, approximating the standard squad.
 */
export function defaultModelCounts(unit: Unit): Record<string, number> {
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
export function profileRows(unit: Unit, mode: AttackMode): ProfileRow[] {
  const modelCounts = defaultModelCounts(unit)
  const defaults = new Map<string, number>()
  const maxes = new Map<string, number>()
  for (const model of unit.models) {
    const n = modelCounts[model.id]
    // options in the same choice group are alternatives: only the first
    // default in each group counts towards the default loadout
    const groupsSeen = new Set<string>()
    for (const ref of model.weapons) {
      let def = ref.defaultCount
      if (def > 0 && ref.choiceGroup) {
        if (groupsSeen.has(ref.choiceGroup)) def = 0
        else groupsSeen.add(ref.choiceGroup)
      }
      defaults.set(ref.weaponId, (defaults.get(ref.weaponId) ?? 0) + n * def)
      maxes.set(
        ref.weaponId,
        (maxes.get(ref.weaponId) ?? 0) + model.max * ref.max,
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
      rows.push({
        key: `${weapon.id}:${weapon.profiles.indexOf(profile)}`,
        weaponName: weapon.name,
        profile,
        defaultCount: def,
        maxCount: Math.max(maxes.get(weapon.id) ?? 0, def, 1),
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
  /** A character attached to the unit (allocated to last) */
  attachedUnit?: Unit
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

export function defenseGroups(unit: Unit): DefenseGroup[] {
  const modelDefaults = defaultModelCounts(unit)
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
      group.max += m.max
      group.defaultCount += modelDefaults[m.id]
    }
  }
  const total = groups.reduce((sum, g) => sum + g.defaultCount, 0)
  if (total === 0 && groups[0]) groups[0].defaultCount = 1
  for (const g of groups) g.max = Math.max(g.max, g.defaultCount, 1)
  return groups.map((g) => {
    const { ids, ...rest } = g
    void ids
    return rest
  })
}

export function toDefenderInput(config: DefenderConfig): DefenderInput {
  const overrides = config.overrides ?? {}
  const groups = defenseGroups(config.unit)
  const segments: DefenderSegment[] = groups
    .filter((g) => (config.modelCounts[g.id] ?? 0) > 0)
    .map((g) => ({
      models: config.modelCounts[g.id],
      toughness: g.T,
      save: g.SV,
      wounds: Math.max(1, g.W),
      invuln: override(overrides.invuln, config.unit.invuln),
      feelNoPain: override(overrides.feelNoPain, config.unit.feelNoPain),
    }))
  if (segments.length === 0 && groups[0]) {
    const g = groups[0]
    segments.push({
      models: 1,
      toughness: g.T,
      save: g.SV,
      wounds: Math.max(1, g.W),
      invuln: override(overrides.invuln, config.unit.invuln),
      feelNoPain: override(overrides.feelNoPain, config.unit.feelNoPain),
    })
  }
  const input: DefenderInput = {
    segments,
    damageReduction: overrides.damageReduction ? 1 : 0,
    keywords: config.unit.keywords,
  }
  const char = config.attachedUnit
  const charStat = char?.statlines[0]
  if (char && charStat) {
    segments.push({
      models: 1,
      toughness: charStat.T,
      save: charStat.SV,
      wounds: Math.max(1, charStat.W),
      invuln: override(overrides.invuln, char.invuln),
      feelNoPain: override(overrides.feelNoPain, char.feelNoPain),
    })
    input.attachedLast = true
    // Anti-X matches against the combined unit's keywords
    input.keywords = [...new Set([...config.unit.keywords, ...char.keywords])]
  }
  return input
}

/** Units that can be attached as leaders (10e Character keyword) */
export function characterUnits(units: Unit[]): Unit[] {
  return units.filter((u) => u.keywords.includes('Character'))
}

export function runSimulation(
  edition: string,
  rows: ProfileRow[],
  counts: Record<string, number>,
  /** Per-row BS/WS characteristic overrides (stack with roll modifiers) */
  skills: Record<string, number>,
  defender: DefenderConfig,
  context: AttackContext,
): AttackResult | undefined {
  const engine = engines[edition]
  if (!engine) return undefined
  const weapons: WeaponInput[] = rows
    .map((row) => {
      const skill = skills[row.key]
      const profile =
        skill !== undefined && row.profile.skill > 0
          ? { ...row.profile, skill }
          : row.profile
      return { profile, count: counts[row.key] ?? 0 }
    })
    .filter((w) => w.count > 0)
  return engine.resolveAttacks(weapons, toDefenderInput(defender), context)
}
