import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge/badge'
import { Button } from '@/components/ui/button/button'
import { AttackerPanel } from '@/components/AttackerPanel.tsx'
import { DefenderPanel } from '@/components/DefenderPanel.tsx'
import { ModifiersPanel } from '@/components/ModifiersPanel.tsx'
import { ResultsPanel } from '@/components/ResultsPanel.tsx'
import { useEditions, useFaction } from '@/data/hooks.ts'
import type { Unit } from '@/data/types.ts'
import { SegmentedControl } from '@/components/SegmentedControl.tsx'
import {
  defaultUnitSize,
  profileRows,
  runSimulation,
  type AttackMode,
  type DefenderOverrides,
} from '@/lib/simulation.ts'
import { parseState, serializeState } from '@/lib/urlState.ts'
import type { AttackContext } from '@/rules/types.ts'

const DEFAULT_EDITION = '10e'

function App() {
  const [initial] = useState(() => parseState(window.location.hash))
  const editions = useEditions()
  const [edition, setEdition] = useState(initial.edition ?? DEFAULT_EDITION)
  // URL-provided values consumed once, when their unit's data first loads
  const [pending, setPending] = useState({
    counts: initial.counts,
    skills: initial.skills,
    statlineId: initial.statlineId,
    models: initial.models,
  })

  const [attackerFaction, setAttackerFaction] = useState(
    initial.attackerFaction,
  )
  const [attackerUnitId, setAttackerUnitId] = useState(initial.attackerUnitId)
  const [attackerCharId, setAttackerCharId] = useState(initial.attackerCharId)
  const [mode, setMode] = useState<AttackMode>(initial.mode ?? 'shooting')
  const [counts, setCounts] = useState<Record<string, number>>({})
  // BS/WS characteristic overrides by row key (only deltas are stored)
  const [skills, setSkills] = useState<Record<string, number>>({})

  const [defenderFaction, setDefenderFaction] = useState(
    initial.defenderFaction,
  )
  const [defenderUnitId, setDefenderUnitId] = useState(initial.defenderUnitId)
  const [defenderCharId, setDefenderCharId] = useState(initial.defenderCharId)
  const [statlineId, setStatlineId] = useState<string>()
  const [models, setModels] = useState(1)

  const [context, setContext] = useState<AttackContext>(initial.context ?? {})
  const [overrides, setOverrides] = useState<DefenderOverrides>(
    initial.overrides ?? {},
  )

  const attackerData = useFaction(edition, attackerFaction)
  const defenderData = useFaction(edition, defenderFaction)
  const attacker = attackerData.data?.units.find((u) => u.id === attackerUnitId)
  const attackerChar = attackerData.data?.units.find(
    (u) => u.id === attackerCharId,
  )
  const defender = defenderData.data?.units.find((u) => u.id === defenderUnitId)
  const defenderChar = defenderData.data?.units.find(
    (u) => u.id === defenderCharId,
  )

  const rows = useMemo(() => {
    if (!attacker) return []
    const unitRows = profileRows(attacker, mode)
    if (!attackerChar) return unitRows
    // the attached character attacks alongside the unit; its row keys are
    // namespaced so shared weapon entries don't collide with the unit's
    return [
      ...unitRows,
      ...profileRows(attackerChar, mode).map((r) => ({
        ...r,
        key: `c.${r.key}`,
      })),
    ]
  }, [attacker, attackerChar, mode])
  // reset weapon counts to the new defaults whenever the rows change
  const [countsFor, setCountsFor] = useState<typeof rows>()
  if (countsFor !== rows) {
    setCountsFor(rows)
    if (rows.length > 0) {
      const defaults = Object.fromEntries(
        rows.map((r) => [r.key, r.defaultCount]),
      )
      setCounts({ ...defaults, ...pending.counts })
      setSkills(pending.skills ?? {})
      // URL-provided values are for the first real loadout only
      if (pending.counts || pending.skills) {
        setPending((p) => ({ ...p, counts: undefined, skills: undefined }))
      }
    } else {
      setCounts({})
      setSkills({})
    }
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
      edition,
      rows,
      counts,
      skills,
      {
        unit: defender,
        statlineId: statlineId ?? '',
        models,
        attachedUnit: defenderChar,
        overrides,
      },
      context,
    )
  }, [
    edition,
    attacker,
    defender,
    defenderChar,
    rows,
    counts,
    skills,
    statlineId,
    models,
    overrides,
    context,
  ])

  // keep the URL in sync so any state is shareable
  const hash = useMemo(() => {
    const defaults = Object.fromEntries(
      rows.map((r) => [r.key, r.defaultCount]),
    )
    const changed = Object.fromEntries(
      Object.entries(counts).filter(([k, v]) => defaults[k] !== v),
    )
    return serializeState({
      edition,
      attackerFaction,
      attackerUnitId,
      attackerCharId,
      mode,
      counts: changed,
      skills,
      defenderFaction,
      defenderUnitId,
      defenderCharId,
      statlineId,
      models: defender ? models : undefined,
      context,
      overrides,
    })
  }, [
    edition,
    attackerFaction,
    attackerUnitId,
    attackerCharId,
    mode,
    rows,
    counts,
    skills,
    defenderFaction,
    defenderUnitId,
    defenderCharId,
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
          {(editions.data?.length ?? 0) > 1 ? (
            <SegmentedControl
              label="Edition"
              options={editions.data!.map((e) => ({
                value: e.edition,
                label: e.label,
              }))}
              value={edition}
              onChange={(next) => {
                setEdition(next)
                setAttackerFaction(undefined)
                setAttackerUnitId(undefined)
                setDefenderFaction(undefined)
                setDefenderUnitId(undefined)
              }}
            />
          ) : (
            <Badge>
              {editions.data?.find((e) => e.edition === edition)?.label ??
                '10th Edition'}
            </Badge>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <AttackerPanel
          edition={edition}
          factionFile={attackerFaction}
          unit={attacker}
          factionUnits={attackerData.data?.units ?? []}
          attachedId={attackerCharId}
          mode={mode}
          rows={rows}
          counts={counts}
          skills={skills}
          onFactionChange={(f) => {
            setAttackerFaction(f)
            setAttackerUnitId(undefined)
            setAttackerCharId(undefined)
          }}
          onUnitChange={setAttackerUnitId}
          onAttachedChange={setAttackerCharId}
          onModeChange={setMode}
          onCountChange={(key, count) =>
            setCounts((c) => ({ ...c, [key]: count }))
          }
          onSkillChange={(key, skill) =>
            setSkills((s) => {
              const next = { ...s }
              if (skill === undefined) delete next[key]
              else next[key] = skill
              return next
            })
          }
        />
        <DefenderPanel
          edition={edition}
          factionFile={defenderFaction}
          unit={defender}
          factionUnits={defenderData.data?.units ?? []}
          attached={defenderChar}
          statlineId={statlineId}
          models={models}
          onFactionChange={(f) => {
            setDefenderFaction(f)
            setDefenderUnitId(undefined)
            setDefenderCharId(undefined)
          }}
          onUnitChange={setDefenderUnitId}
          onAttachedChange={setDefenderCharId}
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

      <ResultsPanel
        result={result}
        defenderName={defender?.name}
        attachedName={defenderChar?.name}
      />

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
