import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select'
import type { Unit } from '@/data/types.ts'
import { characterUnits } from '@/lib/simulation.ts'

const NONE = 'none'

interface CharacterSelectProps {
  units: Unit[]
  value?: string
  onChange: (unitId: string | undefined) => void
}

/** Optional attached-character picker (10e Leader rules) */
export function CharacterSelect({
  units,
  value,
  onChange,
}: CharacterSelectProps) {
  const characters = characterUnits(units)
  if (characters.length === 0) return null
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
    >
      <SelectTrigger aria-label="Attached character">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No attached character</SelectItem>
        {characters.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
