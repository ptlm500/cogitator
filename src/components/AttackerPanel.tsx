import { Badge } from '@/components/ui/badge/badge'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs/tabs'
import type { Unit } from '@/data/types.ts'
import type { AttackMode, ProfileRow } from '@/lib/simulation.ts'
import { NumberStepper } from './NumberStepper.tsx'
import { UnitSelect } from './UnitSelect.tsx'

interface AttackerPanelProps {
  edition: string
  factionFile?: string
  unit?: Unit
  mode: AttackMode
  rows: ProfileRow[]
  counts: Record<string, number>
  /** BS/WS characteristic overrides by row key */
  skills: Record<string, number>
  onFactionChange: (file: string) => void
  onUnitChange: (unitId: string) => void
  onModeChange: (mode: AttackMode) => void
  onCountChange: (key: string, count: number) => void
  onSkillChange: (key: string, skill: number | undefined) => void
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
  mode,
  rows,
  counts,
  skills,
  onFactionChange,
  onUnitChange,
  onModeChange,
  onCountChange,
  onSkillChange,
}: AttackerPanelProps) {
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
                      {row.profile.keywords.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {row.profile.keywords.map((kw) => (
                            <Badge key={kw} variant="OFFLINE">
                              {kw}
                            </Badge>
                          ))}
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
