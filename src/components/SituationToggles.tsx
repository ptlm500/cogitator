import { Button } from '@/components/ui/button/button'
import type { AttackContext } from '@/rules/types.ts'

type ToggleKey = 'halfRange' | 'stationary' | 'charged' | 'inCover'

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'halfRange', label: 'Half range', hint: 'Rapid Fire / Melta' },
  { key: 'stationary', label: 'Stationary', hint: 'Heavy' },
  { key: 'charged', label: 'Charged', hint: 'Lance' },
  { key: 'inCover', label: 'Target in cover', hint: 'Benefit of Cover' },
]

interface SituationTogglesProps {
  context: AttackContext
  onChange: (context: AttackContext) => void
}

export function SituationToggles({ context, onChange }: SituationTogglesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TOGGLES.map(({ key, label, hint }) => (
        <Button
          key={key}
          size="SM"
          variant={context[key] ? 'EXEC' : 'OUTLINE'}
          onClick={() => onChange({ ...context, [key]: !context[key] })}
          title={hint}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
