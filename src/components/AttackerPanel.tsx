import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs/tabs'
import { useState, type ReactNode } from 'react'
import type { Unit } from '@/data/types.ts'
import type { AttackMode, ProfileRow } from '@/lib/simulation.ts'
import type { DamageRerollMode, RerollMode } from '@/rules/types.ts'
import { EXTRA_ABILITIES, extraLabels } from '@/lib/weaponExtras.ts'
import { NumberStepper } from './NumberStepper.tsx'
import { CharacterSelect } from './CharacterSelect.tsx'
import { SegmentedControl } from './SegmentedControl.tsx'
import { UnitSelect } from './UnitSelect.tsx'

/** 'inherit' = use the global Modifiers setting for this row */
type RowReroll<T> = T | 'inherit'

const ROW_REROLL_OPTIONS: { value: RowReroll<RerollMode>; label: string }[] = [
  { value: 'inherit', label: 'Glob' },
  { value: 'none', label: '—' },
  { value: 'ones', label: '1s' },
  { value: 'fails', label: 'Fails' },
  { value: 'noncrits', label: 'Fish' },
]

const ROW_DAMAGE_REROLL_OPTIONS: {
  value: RowReroll<DamageRerollMode>
  label: string
}[] = [
  { value: 'inherit', label: 'Glob' },
  { value: 'none', label: '—' },
  { value: 'ones', label: '1s' },
  { value: 'all', label: 'All' },
]

const REROLL_CHIP: Record<string, string> = {
  none: 'Off',
  ones: '1s',
  fails: 'Fails',
  noncrits: 'Fish',
  all: 'All',
}

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
  /** Strength characteristic overrides by row key */
  strengths: Record<string, number>
  /** AP overrides by row key */
  aps: Record<string, number>
  /** Damage characteristic modifiers by row key */
  damageBonus: Record<string, number>
  /** Granted ability codes by row key (see weaponExtras.ts) */
  extras: Record<string, string[]>
  /** Per-row re-roll overrides by row key (absent = use global setting) */
  rerollHits: Record<string, RerollMode>
  rerollWounds: Record<string, RerollMode>
  rerollDamage: Record<string, DamageRerollMode>
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onAttachedChange: (index: number, unitId: string | undefined) => void
  onModeChange: (mode: AttackMode) => void
  onCountChange: (key: string, count: number) => void
  onSkillChange: (key: string, skill: number | undefined) => void
  onAttackBonusChange: (key: string, bonus: number | undefined) => void
  onStrengthChange: (key: string, strength: number | undefined) => void
  onApChange: (key: string, ap: number | undefined) => void
  onDamageBonusChange: (key: string, bonus: number | undefined) => void
  onExtraToggle: (key: string, code: string) => void
  onRerollHitsChange: (key: string, mode: RerollMode | undefined) => void
  onRerollWoundsChange: (key: string, mode: RerollMode | undefined) => void
  onRerollDamageChange: (
    key: string,
    mode: DamageRerollMode | undefined,
  ) => void
}

function Tweak({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-[10px] uppercase text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </span>
  )
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
  strengths,
  aps,
  damageBonus,
  extras,
  rerollHits,
  rerollWounds,
  rerollDamage,
  onFactionChange,
  onUnitChange,
  onAttachedChange,
  onModeChange,
  onCountChange,
  onSkillChange,
  onAttackBonusChange,
  onStrengthChange,
  onApChange,
  onDamageBonusChange,
  onExtraToggle,
  onRerollHitsChange,
  onRerollWoundsChange,
  onRerollDamageChange,
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
                {rows.map((row) => {
                  const modChips: string[] = []
                  const ab = attackBonus[row.key] ?? 0
                  if (ab !== 0) modChips.push(`A${ab > 0 ? '+' : ''}${ab}`)
                  const sk = skills[row.key]
                  if (sk !== undefined && sk !== row.profile.skill) {
                    modChips.push(
                      `${row.profile.type === 'ranged' ? 'BS' : 'WS'}${sk}+`,
                    )
                  }
                  const st = strengths[row.key]
                  if (st !== undefined && st !== row.profile.strength) {
                    modChips.push(`S${st}`)
                  }
                  const apv = aps[row.key]
                  if (apv !== undefined && apv !== row.profile.ap) {
                    modChips.push(`AP-${apv}`)
                  }
                  const db = damageBonus[row.key] ?? 0
                  if (db !== 0) modChips.push(`D${db > 0 ? '+' : ''}${db}`)
                  const rrh = rerollHits[row.key]
                  if (rrh !== undefined) {
                    modChips.push(`RR-H ${REROLL_CHIP[rrh]}`)
                  }
                  const rrw = rerollWounds[row.key]
                  if (rrw !== undefined) {
                    modChips.push(`RR-W ${REROLL_CHIP[rrw]}`)
                  }
                  const rrd = rerollDamage[row.key]
                  if (rrd !== undefined) {
                    modChips.push(`RR-D ${REROLL_CHIP[rrd]}`)
                  }
                  const editing = abilityEditor === row.key
                  const modified = modChips.length > 0
                  return (
                    <li
                      key={row.key}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0 grow">
                        <p className="truncate text-sm text-[var(--text-primary)]">
                          {row.profile.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {statText(row.profile)}
                        </p>
                        {(row.profile.keywords.length > 0 ||
                          modified ||
                          (extras[row.key]?.length ?? 0) > 0) && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {row.profile.keywords.map((kw) => (
                              <Badge key={kw} variant="OFFLINE">
                                {kw}
                              </Badge>
                            ))}
                            {[
                              ...modChips,
                              ...extraLabels(extras[row.key] ?? []),
                            ].map((label) => (
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
                            setAbilityEditor(editing ? null : row.key)
                          }
                          aria-label={`Modify ${row.profile.name}`}
                          aria-expanded={editing}
                          className="mt-1 border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)] hover:text-[var(--color-green)]"
                        >
                          {editing ? '− modify' : '+ modify'}
                        </button>
                        {editing && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                              <Tweak label="A±">
                                <NumberStepper
                                  value={ab}
                                  min={-3}
                                  max={9}
                                  format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                                  emphasis={ab !== 0}
                                  onChange={(v) =>
                                    onAttackBonusChange(
                                      row.key,
                                      v === 0 ? undefined : v,
                                    )
                                  }
                                  label={`${row.profile.name} attacks bonus`}
                                />
                              </Tweak>
                              {row.profile.skill > 0 && (
                                <Tweak
                                  label={
                                    row.profile.type === 'ranged' ? 'BS' : 'WS'
                                  }
                                >
                                  <NumberStepper
                                    value={sk ?? row.profile.skill}
                                    min={2}
                                    max={6}
                                    format={(v) => `${v}+`}
                                    emphasis={
                                      (sk ?? row.profile.skill) !==
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
                                </Tweak>
                              )}
                              <Tweak label="S">
                                <NumberStepper
                                  value={st ?? row.profile.strength}
                                  min={1}
                                  max={24}
                                  emphasis={
                                    (st ?? row.profile.strength) !==
                                    row.profile.strength
                                  }
                                  onChange={(v) =>
                                    onStrengthChange(
                                      row.key,
                                      v === row.profile.strength
                                        ? undefined
                                        : v,
                                    )
                                  }
                                  label={`${row.profile.name} strength`}
                                />
                              </Tweak>
                              <Tweak label="AP">
                                <NumberStepper
                                  value={apv ?? row.profile.ap}
                                  min={0}
                                  max={6}
                                  format={(v) => `-${v}`}
                                  emphasis={
                                    (apv ?? row.profile.ap) !== row.profile.ap
                                  }
                                  onChange={(v) =>
                                    onApChange(
                                      row.key,
                                      v === row.profile.ap ? undefined : v,
                                    )
                                  }
                                  label={`${row.profile.name} AP`}
                                />
                              </Tweak>
                              <Tweak label="D±">
                                <NumberStepper
                                  value={db}
                                  min={-3}
                                  max={9}
                                  format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                                  emphasis={db !== 0}
                                  onChange={(v) =>
                                    onDamageBonusChange(
                                      row.key,
                                      v === 0 ? undefined : v,
                                    )
                                  }
                                  label={`${row.profile.name} damage bonus`}
                                />
                              </Tweak>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                              <SegmentedControl
                                label="Re-roll hits"
                                ariaLabel={`${row.profile.name} re-roll hits`}
                                options={ROW_REROLL_OPTIONS}
                                value={rrh ?? 'inherit'}
                                onChange={(v) =>
                                  onRerollHitsChange(
                                    row.key,
                                    v === 'inherit' ? undefined : v,
                                  )
                                }
                              />
                              <SegmentedControl
                                label="Re-roll wounds"
                                ariaLabel={`${row.profile.name} re-roll wounds`}
                                options={ROW_REROLL_OPTIONS}
                                value={rrw ?? 'inherit'}
                                onChange={(v) =>
                                  onRerollWoundsChange(
                                    row.key,
                                    v === 'inherit' ? undefined : v,
                                  )
                                }
                              />
                              <SegmentedControl
                                label="Re-roll damage"
                                ariaLabel={`${row.profile.name} re-roll damage`}
                                options={ROW_DAMAGE_REROLL_OPTIONS}
                                value={rrd ?? 'inherit'}
                                onChange={(v) =>
                                  onRerollDamageChange(
                                    row.key,
                                    v === 'inherit' ? undefined : v,
                                  )
                                }
                              />
                            </div>
                            <p className="mt-2 flex flex-wrap gap-1">
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
                          </>
                        )}
                      </div>
                      <NumberStepper
                        value={counts[row.key] ?? 0}
                        min={0}
                        max={row.maxCount}
                        onChange={(v) => onCountChange(row.key, v)}
                        label={row.profile.name}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </PanelContent>
    </Panel>
  )
}
