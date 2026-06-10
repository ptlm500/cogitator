import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import type { Unit } from '@/data/types.ts'
import { defenseGroups } from '@/lib/simulation.ts'
import { CharacterSelect } from './CharacterSelect.tsx'
import { NumberStepper } from './NumberStepper.tsx'
import { UnitSelect } from './UnitSelect.tsx'

interface DefenderPanelProps {
  edition: string
  factionFile?: string
  unit?: Unit
  /** All units of the selected faction (for the character picker) */
  factionUnits: Unit[]
  attached?: Unit
  /** Model count per statline id */
  modelCounts: Record<string, number>
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onAttachedChange: (unitId: string | undefined) => void
  onModelCountChange: (statlineId: string, count: number) => void
}

export function DefenderPanel({
  edition,
  factionFile,
  unit,
  factionUnits,
  attached,
  modelCounts,
  onFactionChange,
  onUnitChange,
  onAttachedChange,
  onModelCountChange,
}: DefenderPanelProps) {
  const groups = unit ? defenseGroups(unit) : []
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
            <CharacterSelect
              units={factionUnits.filter((u) => u.id !== unit.id)}
              value={attached?.id}
              onChange={onAttachedChange}
            />
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
                {groups.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text-primary)]">
                        {g.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        T{g.T} · SV{g.SV}+ · W{g.W} · OC{g.OC}
                      </p>
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
            {attached && attached.statlines[0] && (
              <p className="text-xs text-[var(--text-muted)]">
                + {attached.name}: T{attached.statlines[0].T} · SV
                {attached.statlines[0].SV}+ · W{attached.statlines[0].W}
                {attached.invuln ? ` · ${attached.invuln}++` : ''}
                {attached.feelNoPain ? ` · FNP ${attached.feelNoPain}+` : ''}
                <span className="ml-1">(takes hits last)</span>
              </p>
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
