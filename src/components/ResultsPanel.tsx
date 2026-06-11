import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import type { ModelSlot } from '@/lib/simulation.ts'
import type { AttackResult } from '@/rules/types.ts'
import { DistChart } from './DistChart.tsx'
import { UnitDiagram } from './UnitDiagram.tsx'

interface ResultsPanelProps {
  result?: AttackResult
  defenderName?: string
  attachedNames?: string[]
  modelLayout?: ModelSlot[]
  onSave?: () => void
  saveDisabled?: boolean
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const pct = (p: number) =>
  p >= 0.9995
    ? '>99.9%'
    : p < 0.0005 && p > 0
      ? '<0.1%'
      : `${(p * 100).toFixed(1)}%`

export function ResultsPanel({
  result,
  defenderName,
  attachedNames = [],
  modelLayout = [],
  onSave,
  saveDisabled = false,
}: ResultsPanelProps) {
  return (
    <Panel>
      <PanelHeader className="flex items-center justify-between">
        <PanelTitle>Combat Analysis</PanelTitle>
        {result && onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            title={
              saveDisabled
                ? 'Comparison list is full'
                : 'Save this result for comparison'
            }
            className="border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--text-muted)] hover:text-[var(--color-green)] disabled:opacity-40"
          >
            Save for comparison
          </button>
        )}
      </PanelHeader>
      <PanelContent className="flex flex-col gap-6">
        {!result ? (
          <p className="text-sm text-[var(--text-muted)]">
            Select an attacker and a defender to run the numbers.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ['Attacks', fmt(result.expected.attacks)],
                  ['Hits', fmt(result.expected.hits)],
                  ['Wounds', fmt(result.expected.wounds)],
                  ['Unsaved', fmt(result.expected.unsaved)],
                  ['Damage', fmt(result.expected.damage)],
                  ['Slain', fmt(result.expected.modelsSlain)],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="border border-[var(--border)] px-2 py-3"
                >
                  <dt className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                    {label}
                  </dt>
                  <dd className="font-mono text-xl text-[var(--color-green)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-[var(--text-muted)]">
              Probability {defenderName ?? 'the defender'} is destroyed:{' '}
              <span className="font-mono text-[var(--color-amber)]">
                {pct(result.unitKilled)}
              </span>
              {result.characterSlain?.map((p, i) => (
                <span key={i}>
                  {' · '}
                  {attachedNames[i] ?? 'attached character'} slain:{' '}
                  <span className="font-mono text-[var(--color-amber)]">
                    {pct(p)}
                  </span>
                </span>
              ))}
            </p>
            {modelLayout.length > 0 && (
              <UnitDiagram damage={result.damage} models={modelLayout} />
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <DistChart title="Models slain" dist={result.slain} />
              <DistChart title="Damage inflicted" dist={result.damage} />
            </div>
          </>
        )}
      </PanelContent>
    </Panel>
  )
}
