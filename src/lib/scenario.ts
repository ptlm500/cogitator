// Recompute a full result from a serialized scenario (a SharedState), used
// by the saved-comparison rows. Mirrors the assembly the App does for its
// live state so a saved entry always reflects current engine behaviour.
import type { Unit } from '@/data/types.ts'
import type { AttackResult } from '@/rules/types.ts'
import { editionUiFor } from './editions.ts'
import {
  defenseGroups,
  profileRows,
  runSimulation,
  type ProfileRow,
} from './simulation.ts'
import type { SharedState } from './urlState.ts'

export interface ScenarioSummary {
  edition: string
  mode: 'shooting' | 'melee'
  attackerLabel: string
  defenderLabel: string
  result: AttackResult
}

export function computeScenario(
  state: SharedState,
  attackerUnits: Unit[] | undefined,
  defenderUnits: Unit[] | undefined,
): ScenarioSummary | undefined {
  const edition = state.edition ?? '10e'
  const mode = state.mode ?? 'shooting'
  const attacker = attackerUnits?.find((u) => u.id === state.attackerUnitId)
  const defender = defenderUnits?.find((u) => u.id === state.defenderUnitId)
  if (!attacker || !defender) return undefined

  const maxChars = editionUiFor(edition).maxAttachedCharacters
  const findUnits = (units: Unit[] | undefined, ids: string[] | undefined) =>
    (ids ?? [])
      .slice(0, maxChars)
      .map((id) => units?.find((u) => u.id === id))
      .filter((u): u is Unit => u !== undefined)
  const attackerChars = findUnits(attackerUnits, state.attackerCharIds)
  const defenderChars = findUnits(defenderUnits, state.defenderCharIds)

  const rows: ProfileRow[] = [
    ...profileRows(attacker, mode),
    ...attackerChars.flatMap((char, i) =>
      profileRows(char, mode).map((r) => ({ ...r, key: `c${i}.${r.key}` })),
    ),
  ]
  const counts = {
    ...Object.fromEntries(rows.map((r) => [r.key, r.defaultCount])),
    ...state.counts,
  }

  const groups = defenseGroups(defender)
  const modelCounts = {
    ...Object.fromEntries(groups.map((g) => [g.id, g.defaultCount])),
    ...state.modelCounts,
  }
  if (state.legacyModels !== undefined && groups[0]) {
    modelCounts[groups[0].id] = state.legacyModels
  }

  const result = runSimulation(
    edition,
    rows,
    {
      counts,
      skills: state.skills,
      attackBonus: state.attackBonus,
      strength: state.strength,
      ap: state.ap,
      damageBonus: state.damageBonus,
      extras: state.extras,
    },
    {
      unit: defender,
      modelCounts,
      groupOrder: state.groupOrder,
      groupToughness: state.defToughness,
      groupSave: state.defSave,
      groupWounds: state.defWounds,
      attachedUnits: defenderChars,
      overrides: state.overrides,
    },
    state.context ?? {},
  )
  if (!result) return undefined

  const withChars = (name: string, chars: Unit[]) =>
    chars.length > 0
      ? `${name} + ${chars.map((c) => c.name).join(' + ')}`
      : name
  return {
    edition,
    mode,
    attackerLabel: withChars(attacker.name, attackerChars),
    defenderLabel: withChars(defender.name, defenderChars),
    result,
  }
}
