import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge/badge'
import { AttackerPanel } from '@/components/AttackerPanel.tsx'
import { DefenderPanel } from '@/components/DefenderPanel.tsx'
import { ResultsPanel } from '@/components/ResultsPanel.tsx'
import { SituationToggles } from '@/components/SituationToggles.tsx'
import type { Unit } from '@/data/types.ts'
import {
  defaultUnitSize,
  profileRows,
  runSimulation,
  type AttackMode,
} from '@/lib/simulation.ts'
import type { AttackContext } from '@/rules/types.ts'

const EDITION = '10e'

function App() {
  const [attackerFaction, setAttackerFaction] = useState<string>()
  const [attacker, setAttacker] = useState<Unit>()
  const [mode, setMode] = useState<AttackMode>('shooting')
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [defenderFaction, setDefenderFaction] = useState<string>()
  const [defender, setDefender] = useState<Unit>()
  const [statlineId, setStatlineId] = useState<string>()
  const [models, setModels] = useState(1)

  const [context, setContext] = useState<AttackContext>({})

  const rows = useMemo(
    () => (attacker ? profileRows(attacker, mode) : []),
    [attacker, mode],
  )
  // reset weapon counts to the new defaults whenever the rows change
  const [countsFor, setCountsFor] = useState<typeof rows>()
  if (countsFor !== rows) {
    setCountsFor(rows)
    setCounts(Object.fromEntries(rows.map((r) => [r.key, r.defaultCount])))
  }

  const result = useMemo(() => {
    if (!attacker || !defender || rows.length === 0) return undefined
    return runSimulation(
      EDITION,
      rows,
      counts,
      { unit: defender, statlineId: statlineId ?? '', models },
      context,
    )
  }, [attacker, defender, rows, counts, statlineId, models, context])

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-mono text-2xl uppercase tracking-widest text-[var(--color-green)]">
          Cogitator
        </h1>
        <Badge>10th Edition</Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <AttackerPanel
          edition={EDITION}
          factionFile={attackerFaction}
          unit={attacker}
          mode={mode}
          rows={rows}
          counts={counts}
          onFactionChange={(f) => {
            setAttackerFaction(f)
            setAttacker(undefined)
          }}
          onUnitChange={setAttacker}
          onModeChange={setMode}
          onCountChange={(key, count) =>
            setCounts((c) => ({ ...c, [key]: count }))
          }
        />
        <DefenderPanel
          edition={EDITION}
          factionFile={defenderFaction}
          unit={defender}
          statlineId={statlineId}
          models={models}
          onFactionChange={(f) => {
            setDefenderFaction(f)
            setDefender(undefined)
          }}
          onUnitChange={(unit) => {
            setDefender(unit)
            setStatlineId(unit.statlines[0]?.id)
            setModels(defaultUnitSize(unit))
          }}
          onStatlineChange={setStatlineId}
          onModelsChange={setModels}
        />
      </div>

      <SituationToggles context={context} onChange={setContext} />

      <ResultsPanel result={result} defenderName={defender?.name} />

      <footer className="mt-auto pt-4 text-xs text-[var(--text-muted)]">
        Data from{' '}
        <a
          className="underline hover:text-[var(--color-green)]"
          href="https://github.com/BSData/wh40k-10e"
          target="_blank"
          rel="noreferrer"
        >
          BSData/wh40k-10e
        </a>
        . Unofficial fan project — not affiliated with Games Workshop.
      </footer>
    </main>
  )
}

export default App
