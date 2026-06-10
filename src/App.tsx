import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge/badge'
import { Button } from '@/components/ui/button/button'
import { AttackerPanel } from '@/components/AttackerPanel.tsx'
import { DefenderPanel } from '@/components/DefenderPanel.tsx'
import { ModifiersPanel } from '@/components/ModifiersPanel.tsx'
import { ResultsPanel } from '@/components/ResultsPanel.tsx'
import { useFaction } from '@/data/hooks.ts'
import type { Unit } from '@/data/types.ts'
import {
  defaultUnitSize,
  profileRows,
  runSimulation,
  type AttackMode,
  type DefenderOverrides,
} from '@/lib/simulation.ts'
import { parseState, serializeState } from '@/lib/urlState.ts'
import type { AttackContext } from '@/rules/types.ts'

const EDITION = '10e'

function App() {
  const [initial] = useState(() => parseState(window.location.hash))
  // URL-provided values consumed once, when their unit's data first loads
  const [pending, setPending] = useState({
    counts: initial.counts,
    statlineId: initial.statlineId,
    models: initial.models,
  })

  const [attackerFaction, setAttackerFaction] = useState(
    initial.attackerFaction,
  )
  const [attackerUnitId, setAttackerUnitId] = useState(initial.attackerUnitId)
  const [mode, setMode] = useState<AttackMode>(initial.mode ?? 'shooting')
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [defenderFaction, setDefenderFaction] = useState(
    initial.defenderFaction,
  )
  const [defenderUnitId, setDefenderUnitId] = useState(initial.defenderUnitId)
  const [statlineId, setStatlineId] = useState<string>()
  const [models, setModels] = useState(1)

  const [context, setContext] = useState<AttackContext>(initial.context ?? {})
  const [overrides, setOverrides] = useState<DefenderOverrides>(
    initial.overrides ?? {},
  )

  const attackerData = useFaction(EDITION, attackerFaction)
  const defenderData = useFaction(EDITION, defenderFaction)
  const attacker = attackerData.data?.units.find((u) => u.id === attackerUnitId)
  const defender = defenderData.data?.units.find((u) => u.id === defenderUnitId)

  const rows = useMemo(
    () => (attacker ? profileRows(attacker, mode) : []),
    [attacker, mode],
  )
  // reset weapon counts to the new defaults whenever the rows change
  const [countsFor, setCountsFor] = useState<typeof rows>()
  if (countsFor !== rows) {
    setCountsFor(rows)
    const defaults = Object.fromEntries(
      rows.map((r) => [r.key, r.defaultCount]),
    )
    setCounts({ ...defaults, ...pending.counts })
    if (pending.counts) setPending((p) => ({ ...p, counts: undefined }))
  }

  // reset defender configuration when the defender unit changes
  const [defenderFor, setDefenderFor] = useState<Unit>()
  if (defender !== defenderFor) {
    setDefenderFor(defender)
    if (defender) {
      setStatlineId(pending.statlineId ?? defender.statlines[0]?.id)
      setModels(pending.models ?? defaultUnitSize(defender))
      if (pending.statlineId !== undefined || pending.models !== undefined) {
        setPending((p) => ({ ...p, statlineId: undefined, models: undefined }))
      }
    }
  }

  const result = useMemo(() => {
    if (!attacker || !defender || rows.length === 0) return undefined
    return runSimulation(
      EDITION,
      rows,
      counts,
      { unit: defender, statlineId: statlineId ?? '', models, overrides },
      context,
    )
  }, [attacker, defender, rows, counts, statlineId, models, overrides, context])

  // keep the URL in sync so any state is shareable
  const hash = useMemo(() => {
    const defaults = Object.fromEntries(
      rows.map((r) => [r.key, r.defaultCount]),
    )
    const changed = Object.fromEntries(
      Object.entries(counts).filter(([k, v]) => defaults[k] !== v),
    )
    return serializeState({
      attackerFaction,
      attackerUnitId,
      mode,
      counts: changed,
      defenderFaction,
      defenderUnitId,
      statlineId,
      models: defender ? models : undefined,
      context,
      overrides,
    })
  }, [
    attackerFaction,
    attackerUnitId,
    mode,
    rows,
    counts,
    defenderFaction,
    defenderUnitId,
    statlineId,
    models,
    defender,
    context,
    overrides,
  ])
  useEffect(() => {
    history.replaceState(
      null,
      '',
      hash ? `#${hash}` : window.location.pathname + window.location.search,
    )
  }, [hash])

  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-mono text-2xl uppercase tracking-widest text-[var(--color-green)]">
          Cogitator
        </h1>
        <div className="flex items-center gap-2">
          <Button size="SM" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Badge>10th Edition</Badge>
        </div>
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
            setAttackerUnitId(undefined)
          }}
          onUnitChange={setAttackerUnitId}
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
            setDefenderUnitId(undefined)
          }}
          onUnitChange={setDefenderUnitId}
          onStatlineChange={setStatlineId}
          onModelsChange={setModels}
        />
      </div>

      <ModifiersPanel
        context={context}
        overrides={overrides}
        onContextChange={setContext}
        onOverridesChange={setOverrides}
      />

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
