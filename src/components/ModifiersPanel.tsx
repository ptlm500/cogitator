import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import type { SituationToggle } from '@/lib/editions.ts'
import type { DefenderOverrides } from '@/lib/simulation.ts'
import type {
  AttackContext,
  DamageRerollMode,
  RerollMode,
} from '@/rules/types.ts'
import { SegmentedControl } from './SegmentedControl.tsx'

interface ModifiersPanelProps {
  situations: SituationToggle[]
  context: AttackContext
  overrides: DefenderOverrides
  onContextChange: (context: AttackContext) => void
  onOverridesChange: (overrides: DefenderOverrides) => void
}

const MOD_OPTIONS = [
  { value: -1, label: '-1' },
  { value: 0, label: '0' },
  { value: 1, label: '+1' },
]

const REROLL_OPTIONS: { value: RerollMode; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'ones', label: '1s' },
  { value: 'fails', label: 'Fails' },
  // re-roll non-criticals too, fishing for crits
  { value: 'noncrits', label: 'Fish' },
]

const DAMAGE_REROLL_OPTIONS: { value: DamageRerollMode; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'ones', label: '1s' },
  // a full damage re-roll, used whenever the result is below average
  { value: 'all', label: 'All' },
]

export function ModifiersPanel({
  situations,
  context,
  overrides,
  onContextChange,
  onOverridesChange,
}: ModifiersPanelProps) {
  const ctx = (patch: Partial<AttackContext>) =>
    onContextChange({ ...context, ...patch })
  const ovr = (patch: Partial<DefenderOverrides>) =>
    onOverridesChange({ ...overrides, ...patch })

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Modifiers</PanelTitle>
      </PanelHeader>
      <PanelContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              Situation
            </span>
            <div className="flex flex-wrap gap-1">
              {situations.map(({ key, label, hint }) => {
                const active = Boolean(context[key])
                return (
                  <button
                    key={key}
                    type="button"
                    title={hint}
                    aria-pressed={active}
                    onClick={() => ctx({ [key]: !active })}
                    className={
                      'border px-2 py-1 font-mono text-xs uppercase ' +
                      (active
                        ? 'border-[var(--color-green)] text-[var(--color-green)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]')
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <SegmentedControl
            label="Hit roll"
            options={MOD_OPTIONS}
            value={context.hitMod ?? 0}
            onChange={(v) => ctx({ hitMod: v })}
          />
          <SegmentedControl
            label="Wound roll"
            options={MOD_OPTIONS}
            value={context.woundMod ?? 0}
            onChange={(v) => ctx({ woundMod: v })}
          />
          <SegmentedControl
            label="Re-roll hits"
            options={REROLL_OPTIONS}
            value={context.rerollHits ?? 'none'}
            onChange={(v) => ctx({ rerollHits: v })}
          />
          <SegmentedControl
            label="Re-roll wounds"
            options={REROLL_OPTIONS}
            value={context.rerollWounds ?? 'none'}
            onChange={(v) => ctx({ rerollWounds: v })}
          />
          <SegmentedControl
            label="Re-roll damage"
            options={DAMAGE_REROLL_OPTIONS}
            value={context.rerollDamage ?? 'none'}
            onChange={(v) => ctx({ rerollDamage: v })}
          />
          <SegmentedControl
            label="Crit hits on"
            options={[
              { value: 6, label: '6+' },
              { value: 5, label: '5+' },
            ]}
            value={context.critHitOn ?? 6}
            onChange={(v) => ctx({ critHitOn: v })}
          />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <SegmentedControl
            label="Damage reduction"
            options={[
              { value: 0, label: 'Off' },
              { value: 1, label: '-1 Dmg' },
            ]}
            value={overrides.damageReduction ? 1 : 0}
            onChange={(v) => ovr({ damageReduction: v === 1 })}
          />
        </div>
      </PanelContent>
    </Panel>
  )
}
