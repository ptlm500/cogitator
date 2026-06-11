import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import type { Unit } from '@/data/types.ts'
import { defenseGroups, type DefenseGroup } from '@/lib/simulation.ts'
import { CharacterSelect } from './CharacterSelect.tsx'
import { NumberStepper } from './NumberStepper.tsx'
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
  /** Model count per statline id */
  modelCounts: Record<string, number>
  /** 11e: defender chooses the defense-group allocation order */
  groupReorder: boolean
  groupOrder?: string[]
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onAttachedChange: (index: number, unitId: string | undefined) => void
  onModelCountChange: (statlineId: string, count: number) => void
  onGroupOrderChange: (order: string[]) => void
}

export function DefenderPanel({
  edition,
  factionFile,
  unit,
  factionUnits,
  attachedUnits,
  attachedIds,
  maxAttached,
  modelCounts,
  groupReorder,
  groupOrder,
  onFactionChange,
  onUnitChange,
  onAttachedChange,
  onModelCountChange,
  onGroupOrderChange,
}: DefenderPanelProps) {
  const baseGroups = unit ? defenseGroups(unit) : []
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
                      ['T', stat.T],
                      ['SV', `${stat.SV}+`],
                      ['W', stat.W],
                      ['INV', unit.invuln ? `${unit.invuln}++` : '—'],
                      ['FNP', unit.feelNoPain ? `${unit.feelNoPain}+++` : '—'],
                      ['OC', stat.OC],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="border border-[var(--border)] px-1 py-2"
                    >
                      <dt className="text-xs text-[var(--text-muted)]">
                        {label}
                      </dt>
                      <dd className="font-mono text-lg text-[var(--text-primary)]">
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
              </>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {groups.map((g, gi) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
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
                        <p className="text-xs text-[var(--text-muted)]">
                          T{g.T} · SV{g.SV}+ · W{g.W} · OC{g.OC}
                        </p>
                      </div>
                    </div>
                    <NumberStepper
                      value={modelCounts[g.id] ?? 0}
                      min={0}
                      max={maxFor(g)}
                      onChange={(v) => onModelCountChange(g.id, v)}
                      label={`${g.name} models`}
                    />
                  </li>
                ))}
              </ul>
            )}
            {!single && (
              <p className="text-xs text-[var(--text-muted)]">
                INV {unit.invuln ? `${unit.invuln}++` : '—'} · FNP{' '}
                {unit.feelNoPain ? `${unit.feelNoPain}+` : '—'} · hits are
                allocated to the groups in this order
              </p>
            )}
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
