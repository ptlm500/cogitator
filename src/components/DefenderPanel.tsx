import { useState } from 'react'
import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import type { Unit } from '@/data/types.ts'
import {
  defenseGroups,
  type DefenseGroup,
  type DefenderOverrides,
} from '@/lib/simulation.ts'
import { CharacterSelect } from './CharacterSelect.tsx'
import { NumberStepper } from './NumberStepper.tsx'
import { SegmentedControl } from './SegmentedControl.tsx'
import { SizeSelect } from './SizeSelect.tsx'
import { UnitSelect } from './UnitSelect.tsx'

interface DefenderPanelProps {
  edition: string
  factionFile?: string
  unit?: Unit
  /** All units of the selected faction (for the character picker) */
  factionUnits: Unit[]
  attachedUnits: Unit[]
  attachedIds: string[]
  maxAttached: number
  /** Selected unit-size option (for units with compositions) */
  sizeId?: string
  /** Model count per statline id */
  modelCounts: Record<string, number>
  /** Per-group characteristic overrides (by group id) */
  groupToughness: Record<string, number>
  groupSave: Record<string, number>
  groupWounds: Record<string, number>
  /** Unit-wide invuln/FNP overrides */
  overrides: DefenderOverrides
  /** 11e: defender chooses the defense-group allocation order */
  groupReorder: boolean
  groupOrder?: string[]
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onSizeChange: (sizeId: string) => void
  onAttachedChange: (index: number, unitId: string | undefined) => void
  onModelCountChange: (statlineId: string, count: number) => void
  onGroupToughnessChange: (id: string, value: number | undefined) => void
  onGroupSaveChange: (id: string, value: number | undefined) => void
  onGroupWoundsChange: (id: string, value: number | undefined) => void
  onOverridesChange: (overrides: DefenderOverrides) => void
  onGroupOrderChange: (order: string[]) => void
}

const SAVE_OPTIONS = (suffix: string) => [
  { value: 'auto' as const, label: 'Data' },
  { value: 'none' as const, label: '—' },
  ...[3, 4, 5, 6].map((n) => ({ value: n, label: `${n}${suffix}` })),
]

export function DefenderPanel({
  edition,
  factionFile,
  unit,
  factionUnits,
  attachedUnits,
  attachedIds,
  maxAttached,
  sizeId,
  modelCounts,
  groupToughness,
  groupSave,
  groupWounds,
  overrides,
  groupReorder,
  groupOrder,
  onFactionChange,
  onUnitChange,
  onSizeChange,
  onAttachedChange,
  onModelCountChange,
  onGroupToughnessChange,
  onGroupSaveChange,
  onGroupWoundsChange,
  onOverridesChange,
  onGroupOrderChange,
}: DefenderPanelProps) {
  const [tuneEditor, setTuneEditor] = useState<string | null>(null)
  const baseGroups = unit ? defenseGroups(unit, sizeId) : []
  const orderGroups = (gs: DefenseGroup[]): DefenseGroup[] => {
    if (!groupOrder || groupOrder.length === 0) return gs
    const index = new Map(groupOrder.map((id, i) => [id, i]))
    return [...gs].sort(
      (a, b) =>
        (index.get(a.id) ?? groupOrder.length) -
        (index.get(b.id) ?? groupOrder.length),
    )
  }
  const groups = orderGroups(baseGroups)
  const move = (from: number, dir: -1 | 1) => {
    const ids = groups.map((g) => g.id)
    const to = from + dir
    if (to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    onGroupOrderChange(ids)
  }
  const single = groups.length === 1
  const stat = groups[0]
  const maxFor = (group: (typeof groups)[number]) =>
    Math.max(group.max, modelCounts[group.id] ?? 0)
  const effT = (g: DefenseGroup) => groupToughness[g.id] ?? g.T
  const effSV = (g: DefenseGroup) => groupSave[g.id] ?? g.SV
  const effW = (g: DefenseGroup) => groupWounds[g.id] ?? g.W
  const tweaked = (g: DefenseGroup) =>
    effT(g) !== g.T || effSV(g) !== g.SV || effW(g) !== g.W
  const ovr = (patch: Partial<DefenderOverrides>) =>
    onOverridesChange({ ...overrides, ...patch })
  const fromManual = (v: number | 'none' | undefined) => v ?? 'auto'
  const toManual = (v: number | 'none' | 'auto') =>
    v === 'auto' ? undefined : v
  const effInvuln =
    overrides.invuln === 'none' ? undefined : (overrides.invuln ?? unit?.invuln)
  const effFnp =
    overrides.feelNoPain === 'none'
      ? undefined
      : (overrides.feelNoPain ?? unit?.feelNoPain)

  const tuneControls = (g: DefenseGroup) => (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      <span className="flex items-center gap-1">
        <span className="text-[10px] uppercase text-[var(--text-muted)]">
          T
        </span>
        <NumberStepper
          value={effT(g)}
          min={1}
          max={14}
          emphasis={effT(g) !== g.T}
          onChange={(v) =>
            onGroupToughnessChange(g.id, v === g.T ? undefined : v)
          }
          label={`${g.name} toughness`}
        />
      </span>
      <span className="flex items-center gap-1">
        <span className="text-[10px] uppercase text-[var(--text-muted)]">
          SV
        </span>
        <NumberStepper
          value={effSV(g)}
          min={2}
          max={6}
          format={(v) => `${v}+`}
          emphasis={effSV(g) !== g.SV}
          onChange={(v) => onGroupSaveChange(g.id, v === g.SV ? undefined : v)}
          label={`${g.name} save`}
        />
      </span>
      <span className="flex items-center gap-1">
        <span className="text-[10px] uppercase text-[var(--text-muted)]">
          W
        </span>
        <NumberStepper
          value={effW(g)}
          min={1}
          max={30}
          emphasis={effW(g) !== g.W}
          onChange={(v) => onGroupWoundsChange(g.id, v === g.W ? undefined : v)}
          label={`${g.name} wounds`}
        />
      </span>
    </div>
  )

  const tuneButton = (g: DefenseGroup) => (
    <button
      type="button"
      onClick={() => setTuneEditor(tuneEditor === g.id ? null : g.id)}
      aria-label={`Modify ${g.name}`}
      aria-expanded={tuneEditor === g.id}
      className="mt-1 border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)] hover:text-[var(--color-green)]"
    >
      {tuneEditor === g.id ? '− modify' : '+ modify'}
    </button>
  )

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Defender</PanelTitle>
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
            <SizeSelect unit={unit} sizeId={sizeId} onChange={onSizeChange} />
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
            {single && stat ? (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                  {(
                    [
                      ['T', effT(stat), effT(stat) !== stat.T],
                      ['SV', `${effSV(stat)}+`, effSV(stat) !== stat.SV],
                      ['W', effW(stat), effW(stat) !== stat.W],
                      [
                        'INV',
                        effInvuln ? `${effInvuln}++` : '—',
                        overrides.invuln !== undefined,
                      ],
                      [
                        'FNP',
                        effFnp ? `${effFnp}+++` : '—',
                        overrides.feelNoPain !== undefined,
                      ],
                      ['OC', stat.OC, false],
                    ] as const
                  ).map(([label, value, modified]) => (
                    <div
                      key={label}
                      className="border border-[var(--border)] px-1 py-2"
                    >
                      <dt className="text-xs text-[var(--text-muted)]">
                        {label}
                      </dt>
                      <dd
                        className={
                          'font-mono text-lg ' +
                          (modified
                            ? 'text-[var(--color-amber)]'
                            : 'text-[var(--text-primary)]')
                        }
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">
                    Models in unit
                  </span>
                  <NumberStepper
                    value={modelCounts[stat.id] ?? 1}
                    min={1}
                    max={maxFor(stat)}
                    onChange={(v) => onModelCountChange(stat.id, v)}
                    label="models"
                  />
                </div>
                {tuneButton(stat)}
                {tuneEditor === stat.id && tuneControls(stat)}
              </>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {groups.map((g, gi) => (
                  <li key={g.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {groupReorder && (
                          <span className="flex flex-col">
                            <button
                              type="button"
                              aria-label={`Move ${g.name} earlier`}
                              disabled={gi === 0}
                              onClick={() => move(gi, -1)}
                              className="border border-[var(--border)] px-1 font-mono text-[10px] leading-tight text-[var(--text-muted)] hover:text-[var(--color-green)] disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${g.name} later`}
                              disabled={gi === groups.length - 1}
                              onClick={() => move(gi, 1)}
                              className="border border-[var(--border)] px-1 font-mono text-[10px] leading-tight text-[var(--text-muted)] hover:text-[var(--color-green)] disabled:opacity-30"
                            >
                              ▼
                            </button>
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm text-[var(--text-primary)]">
                            {g.name}
                          </p>
                          <p
                            className={
                              'text-xs ' +
                              (tweaked(g)
                                ? 'text-[var(--color-amber)]'
                                : 'text-[var(--text-muted)]')
                            }
                          >
                            T{effT(g)} · SV{effSV(g)}+ · W{effW(g)} · OC
                            {g.OC}
                          </p>
                          {tuneButton(g)}
                        </div>
                      </div>
                      <NumberStepper
                        value={modelCounts[g.id] ?? 0}
                        min={0}
                        max={maxFor(g)}
                        onChange={(v) => onModelCountChange(g.id, v)}
                        label={`${g.name} models`}
                      />
                    </div>
                    {tuneEditor === g.id && tuneControls(g)}
                  </li>
                ))}
              </ul>
            )}
            {!single && (
              <p className="text-xs text-[var(--text-muted)]">
                hits are allocated to the groups in this order
              </p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <SegmentedControl
                label="Invuln"
                options={SAVE_OPTIONS('++')}
                value={fromManual(overrides.invuln)}
                onChange={(v) => ovr({ invuln: toManual(v) })}
              />
              <SegmentedControl
                label="Feel No Pain"
                options={SAVE_OPTIONS('+')}
                value={fromManual(overrides.feelNoPain)}
                onChange={(v) => ovr({ feelNoPain: toManual(v) })}
              />
            </div>
            {attachedUnits.map(
              (attached) =>
                attached.statlines[0] && (
                  <p
                    key={attached.id}
                    className="text-xs text-[var(--text-muted)]"
                  >
                    + {attached.name}: T{attached.statlines[0].T} · SV
                    {attached.statlines[0].SV}+ · W{attached.statlines[0].W}
                    {attached.invuln ? ` · ${attached.invuln}++` : ''}
                    {attached.feelNoPain
                      ? ` · FNP ${attached.feelNoPain}+`
                      : ''}
                    <span className="ml-1">(takes hits last)</span>
                  </p>
                ),
            )}
            <p className="flex flex-wrap gap-1">
              {unit.keywords.map((kw) => (
                <Badge key={kw} variant="OFFLINE">
                  {kw}
                </Badge>
              ))}
            </p>
          </>
        )}
      </PanelContent>
    </Panel>
  )
}
