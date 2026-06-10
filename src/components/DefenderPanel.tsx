import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select'
import type { Unit } from '@/data/types.ts'
import { NumberStepper } from './NumberStepper.tsx'
import { CharacterSelect } from './CharacterSelect.tsx'
import { UnitSelect } from './UnitSelect.tsx'

interface DefenderPanelProps {
  edition: string
  factionFile?: string
  unit?: Unit
  /** All units of the selected faction (for the character picker) */
  factionUnits: Unit[]
  attached?: Unit
  statlineId?: string
  models: number
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onAttachedChange: (unitId: string | undefined) => void
  onStatlineChange: (id: string) => void
  onModelsChange: (models: number) => void
}

export function DefenderPanel({
  edition,
  factionFile,
  unit,
  factionUnits,
  attached,
  statlineId,
  models,
  onFactionChange,
  onUnitChange,
  onAttachedChange,
  onStatlineChange,
  onModelsChange,
}: DefenderPanelProps) {
  const stat =
    unit?.statlines.find((s) => s.id === statlineId) ?? unit?.statlines[0]
  const maxModels = unit
    ? Math.max(
        unit.models.reduce((sum, m) => sum + m.max, 0),
        1,
      )
    : 1
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
        {unit && stat && (
          <>
            <CharacterSelect
              units={factionUnits.filter((u) => u.id !== unit.id)}
              value={attached?.id}
              onChange={onAttachedChange}
            />
            {unit.statlines.length > 1 && (
              <Select value={stat.id} onValueChange={onStatlineChange}>
                <SelectTrigger aria-label="Statline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unit.statlines.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
                  <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                  <dd className="font-mono text-lg text-[var(--text-primary)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {attached && attached.statlines[0] && (
              <p className="text-xs text-[var(--text-muted)]">
                + {attached.name}: T{attached.statlines[0].T} · SV
                {attached.statlines[0].SV}+ · W{attached.statlines[0].W}
                {attached.invuln ? ` · ${attached.invuln}++` : ''}
                {attached.feelNoPain ? ` · FNP ${attached.feelNoPain}+` : ''}
                <span className="ml-1">(takes hits last)</span>
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">
                Models in unit
              </span>
              <NumberStepper
                value={models}
                min={1}
                max={Math.max(maxModels, models)}
                onChange={onModelsChange}
                label="models"
              />
            </div>
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
