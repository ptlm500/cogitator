import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import type { AttackResult } from '@/rules/types.ts'
import { DistChart } from './DistChart.tsx'

interface ResultsPanelProps {
  result?: AttackResult
  defenderName?: string
  attachedName?: string
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
  attachedName,
}: ResultsPanelProps) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Combat Analysis</PanelTitle>
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
              {result.attachedSlain !== undefined && (
                <>
                  {' · '}
                  {attachedName ?? 'attached character'} slain:{' '}
                  <span className="font-mono text-[var(--color-amber)]">
                    {pct(result.attachedSlain)}
                  </span>
                </>
              )}
            </p>
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
