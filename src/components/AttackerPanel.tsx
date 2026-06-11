import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs/tabs'
import { useState } from 'react'
import type { Unit } from '@/data/types.ts'
import type { AttackMode, ProfileRow } from '@/lib/simulation.ts'
import { EXTRA_ABILITIES, extraLabels } from '@/lib/weaponExtras.ts'
import { NumberStepper } from './NumberStepper.tsx'
import { CharacterSelect } from './CharacterSelect.tsx'
import { UnitSelect } from './UnitSelect.tsx'

interface AttackerPanelProps {
  edition: string
  factionFile?: string
  unit?: Unit
  /** All units of the selected faction (for the character picker) */
  factionUnits: Unit[]
  attachedIds: string[]
  maxAttached: number
  mode: AttackMode
  rows: ProfileRow[]
  counts: Record<string, number>
  /** BS/WS characteristic overrides by row key */
  skills: Record<string, number>
  /** Attacks characteristic modifiers by row key */
  attackBonus: Record<string, number>
  /** Granted ability codes by row key (see weaponExtras.ts) */
  extras: Record<string, string[]>
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onAttachedChange: (index: number, unitId: string | undefined) => void
  onModeChange: (mode: AttackMode) => void
  onCountChange: (key: string, count: number) => void
  onSkillChange: (key: string, skill: number | undefined) => void
  onAttackBonusChange: (key: string, bonus: number | undefined) => void
  onExtraToggle: (key: string, code: string) => void
}

const statText = (p: ProfileRow['profile']) =>
  [
    p.type === 'ranged' ? `${p.range}"` : 'Melee',
    `A${p.attacks}`,
    p.skill > 0 ? `${p.type === 'ranged' ? 'BS' : 'WS'}${p.skill}+` : 'auto',
    `S${p.strength}`,
    `AP-${p.ap}`,
    `D${p.damage}`,
  ].join(' · ')

export function AttackerPanel({
  edition,
  factionFile,
  unit,
  factionUnits,
  attachedIds,
  maxAttached,
  mode,
  rows,
  counts,
  skills,
  attackBonus,
  extras,
  onFactionChange,
  onUnitChange,
  onAttachedChange,
  onModeChange,
  onCountChange,
  onSkillChange,
  onAttackBonusChange,
  onExtraToggle,
}: AttackerPanelProps) {
  const [abilityEditor, setAbilityEditor] = useState<string | null>(null)
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Attacker</PanelTitle>
      </PanelHeader>
      <PanelContent className="flex flex-col gap-4">
        <UnitSelect
          edition={edition}
          factionFile={factionFile}
          unitId={unit?.id}
          onFactionChange={onFactionChange}
          onUnitChange={onUnitChange}
        />
        {unit && (
          <>
            {Array.from({ length: maxAttached }, (_, i) =>
              i === 0 || attachedIds[i - 1] ? (
                <CharacterSelect
                  key={i}
                  units={factionUnits.filter(
                    (u) =>
                      u.id !== unit.id &&
                      !attachedIds.some((id, j) => j !== i && id === u.id),
                  )}
                  value={attachedIds[i]}
                  onChange={(id) => onAttachedChange(i, id)}
                />
              ) : null,
            )}
            <Tabs
              value={mode}
              onValueChange={(v) => onModeChange(v as AttackMode)}
            >
              <TabsList>
                <TabsTrigger value="shooting">Shooting</TabsTrigger>
                <TabsTrigger value="melee">Melee</TabsTrigger>
              </TabsList>
            </Tabs>
            {rows.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No {mode === 'shooting' ? 'ranged' : 'melee'} weapons on this
                unit.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text-primary)]">
                        {row.profile.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {statText(row.profile)}
                      </p>
                      {(row.profile.keywords.length > 0 ||
                        (extras[row.key]?.length ?? 0) > 0) && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {row.profile.keywords.map((kw) => (
                            <Badge key={kw} variant="OFFLINE">
                              {kw}
                            </Badge>
                          ))}
                          {extraLabels(extras[row.key] ?? []).map((label) => (
                            <span
                              key={label}
                              className="border border-[var(--color-amber)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--color-amber)]"
                            >
                              {label}
                            </span>
                          ))}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setAbilityEditor(
                            abilityEditor === row.key ? null : row.key,
                          )
                        }
                        aria-label={`Edit ${row.profile.name} abilities`}
                        aria-expanded={abilityEditor === row.key}
                        className="mt-1 border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)] hover:text-[var(--color-green)]"
                      >
                        {abilityEditor === row.key
                          ? '− abilities'
                          : '+ abilities'}
                      </button>
                      {abilityEditor === row.key && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {EXTRA_ABILITIES.map((ability) => {
                            const active = (extras[row.key] ?? []).includes(
                              ability.code,
                            )
                            return (
                              <button
                                key={ability.code}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  onExtraToggle(row.key, ability.code)
                                }
                                className={
                                  'border px-1.5 py-0.5 font-mono text-[10px] uppercase ' +
                                  (active
                                    ? 'border-[var(--color-amber)] text-[var(--color-amber)]'
                                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]')
                                }
                              >
                                {ability.label}
                              </button>
                            )
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <NumberStepper
                        value={counts[row.key] ?? 0}
                        min={0}
                        max={row.maxCount}
                        onChange={(v) => onCountChange(row.key, v)}
                        label={row.profile.name}
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase text-[var(--text-muted)]">
                          A±
                        </span>
                        <NumberStepper
                          value={attackBonus[row.key] ?? 0}
                          min={-3}
                          max={9}
                          format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                          emphasis={(attackBonus[row.key] ?? 0) !== 0}
                          onChange={(v) =>
                            onAttackBonusChange(
                              row.key,
                              v === 0 ? undefined : v,
                            )
                          }
                          label={`${row.profile.name} attacks bonus`}
                        />
                      </div>
                      {row.profile.skill > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase text-[var(--text-muted)]">
                            {row.profile.type === 'ranged' ? 'BS' : 'WS'}
                          </span>
                          <NumberStepper
                            value={skills[row.key] ?? row.profile.skill}
                            min={2}
                            max={6}
                            format={(v) => `${v}+`}
                            emphasis={
                              (skills[row.key] ?? row.profile.skill) !==
                              row.profile.skill
                            }
                            onChange={(v) =>
                              onSkillChange(
                                row.key,
                                v === row.profile.skill ? undefined : v,
                              )
                            }
                            label={`${row.profile.name} skill`}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PanelContent>
    </Panel>
  )
}
