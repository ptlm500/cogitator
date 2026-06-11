import { useMemo } from 'react'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'
import { useFaction } from '@/data/hooks.ts'
import type { EditionRef } from '@/data/types.ts'
import { computeScenario } from '@/lib/scenario.ts'
import { parseState } from '@/lib/urlState.ts'

interface ComparisonPanelProps {
  /** Serialized scenarios (SharedState hashes) */
  entries: string[]
  editions: EditionRef[]
  onLoad: (entry: string) => void
  onRemove: (index: number) => void
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const pct = (p: number) =>
  p >= 0.9995
    ? '>99.9%'
    : p < 0.0005 && p > 0
      ? '<0.1%'
      : `${(p * 100).toFixed(1)}%`

function ComparisonRow({
  entry,
  editions,
  onLoad,
  onRemove,
}: {
  entry: string
  editions: EditionRef[]
  onLoad: () => void
  onRemove: () => void
}) {
  const state = useMemo(() => parseState(entry), [entry])
  const edition = state.edition ?? '10e'
  const dataEdition =
    editions.find((e) => e.edition === edition)?.data ?? edition
  const attackerData = useFaction(dataEdition, state.attackerFaction)
  const defenderData = useFaction(dataEdition, state.defenderFaction)
  const summary = useMemo(
    () =>
      computeScenario(
        state,
        attackerData.data?.units,
        defenderData.data?.units,
      ),
    [state, attackerData.data, defenderData.data],
  )
  const editionLabel =
    editions.find((e) => e.edition === edition)?.label ?? edition

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
      <div className="min-w-0">
        {summary ? (
          <>
            <p className="truncate text-sm text-[var(--text-primary)]">
              {summary.attackerLabel}{' '}
              <span className="text-[var(--text-muted)]">vs</span>{' '}
              {summary.defenderLabel}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {editionLabel} · {summary.mode}
            </p>
          </>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">loading…</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {summary && (
          <dl className="flex gap-4 text-center">
            {(
              [
                ['Dmg', fmt(summary.result.expected.damage)],
                ['Slain', fmt(summary.result.expected.modelsSlain)],
                ['Wiped', pct(summary.result.unitKilled)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase text-[var(--text-muted)]">
                  {label}
                </dt>
                <dd className="font-mono text-sm text-[var(--color-green)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onLoad}
            className="border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--text-muted)] hover:text-[var(--color-green)]"
          >
            Load
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove comparison"
            className="border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--text-muted)] hover:text-[var(--color-red)]"
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  )
}

export function ComparisonPanel({
  entries,
  editions,
  onLoad,
  onRemove,
}: ComparisonPanelProps) {
  if (entries.length === 0) return null
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Saved Comparisons</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {entries.map((entry, i) => (
            <ComparisonRow
              key={`${i}-${entry}`}
              entry={entry}
              editions={editions}
              onLoad={() => onLoad(entry)}
              onRemove={() => onRemove(i)}
            />
          ))}
        </ul>
      </PanelContent>
    </Panel>
  )
}
