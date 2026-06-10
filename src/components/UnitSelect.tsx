import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select'
import { useDataIndex, useFaction } from '@/data/hooks.ts'
import type { Unit } from '@/data/types.ts'

interface UnitSelectProps {
  edition: string
  factionFile?: string
  unitId?: string
  onFactionChange: (file: string) => void
  onUnitChange: (unit: Unit) => void
}

export function UnitSelect({
  edition,
  factionFile,
  unitId,
  onFactionChange,
  onUnitChange,
}: UnitSelectProps) {
  const index = useDataIndex(edition)
  const faction = useFaction(edition, factionFile)

  if (index.error) {
    return <p className="text-[var(--color-red)]">{index.error}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={factionFile ?? ''}
        onValueChange={onFactionChange}
        disabled={!index.data}
      >
        <SelectTrigger aria-label="Faction">
          <SelectValue
            placeholder={index.data ? 'SELECT FACTION' : 'LOADING…'}
          />
        </SelectTrigger>
        <SelectContent>
          {index.data?.factions.map((f) => (
            <SelectItem key={f.file} value={f.file}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={unitId ?? ''}
        onValueChange={(id) => {
          const unit = faction.data?.units.find((u) => u.id === id)
          if (unit) onUnitChange(unit)
        }}
        disabled={!faction.data}
      >
        <SelectTrigger aria-label="Unit">
          <SelectValue
            placeholder={
              factionFile
                ? faction.data
                  ? 'SELECT UNIT'
                  : 'LOADING…'
                : 'SELECT FACTION FIRST'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {faction.data?.units.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
