import type { Unit, WeaponProfile } from '@/data/types.ts'
import type {
  AttackContext,
  AttackResult,
  DefenderInput,
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
  statlineId: string
  models: number
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

export function toDefenderInput(config: DefenderConfig): DefenderInput {
  const stat =
    config.unit.statlines.find((s) => s.id === config.statlineId) ??
    config.unit.statlines[0]
  const overrides = config.overrides ?? {}
  const input: DefenderInput = {
    toughness: stat.T,
    save: stat.SV,
    wounds: Math.max(1, stat.W),
    models: Math.max(1, config.models),
    invuln: override(overrides.invuln, config.unit.invuln),
    feelNoPain: override(overrides.feelNoPain, config.unit.feelNoPain),
    damageReduction: overrides.damageReduction ? 1 : 0,
    keywords: config.unit.keywords,
  }
  const char = config.attachedUnit
  const charStat = char?.statlines[0]
  if (char && charStat) {
    input.attached = {
      toughness: charStat.T,
      save: charStat.SV,
      wounds: Math.max(1, charStat.W),
      invuln: override(overrides.invuln, char.invuln),
      feelNoPain: override(overrides.feelNoPain, char.feelNoPain),
    }
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
