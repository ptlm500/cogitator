import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select'
import type { Unit } from '@/data/types.ts'
import { sizeFor } from '@/lib/simulation.ts'

interface SizeSelectProps {
  unit: Unit
  sizeId?: string
  onChange: (sizeId: string) => void
}

/** Unit-size picker, shown only for units with selectable compositions */
export function SizeSelect({ unit, sizeId, onChange }: SizeSelectProps) {
  if (!unit.sizes || unit.sizes.length < 2) return null
  const active = sizeFor(unit, sizeId)
  return (
    <Select value={active?.id ?? ''} onValueChange={onChange}>
      <SelectTrigger aria-label="Unit size">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {unit.sizes.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
