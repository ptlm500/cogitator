import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge/badge'
import { Button } from '@/components/ui/button/button'
import { AttackerPanel } from '@/components/AttackerPanel.tsx'
import { DefenderPanel } from '@/components/DefenderPanel.tsx'
import { ModifiersPanel } from '@/components/ModifiersPanel.tsx'
import { ResultsPanel } from '@/components/ResultsPanel.tsx'
import { ComparisonPanel } from '@/components/ComparisonPanel.tsx'
import { useEditions, useFaction } from '@/data/hooks.ts'
import type { Unit } from '@/data/types.ts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select'
import {
  defenderModelLayout,
  defenseGroups,
  profileRows,
  runSimulation,
  type AttackMode,
  type DefenderOverrides,
} from '@/lib/simulation.ts'
import { editionUiFor } from '@/lib/editions.ts'
import { toggleExtra } from '@/lib/weaponExtras.ts'
import { parseState, serializeState } from '@/lib/urlState.ts'
import type {
  AttackContext,
  DamageRerollMode,
  RerollMode,
} from '@/rules/types.ts'

const DEFAULT_EDITION = '10e'

function App() {
  const [initial] = useState(() => parseState(window.location.hash))
  const editions = useEditions()
  const [edition, setEdition] = useState(initial.edition ?? DEFAULT_EDITION)
  // URL-provided values consumed once, when their unit's data first loads
  const [pending, setPending] = useState({
    counts: initial.counts,
    skills: initial.skills,
    attackBonus: initial.attackBonus,
    strength: initial.strength,
    ap: initial.ap,
    damageBonus: initial.damageBonus,
    extras: initial.extras,
    rerollHits: initial.rerollHits,
    rerollWounds: initial.rerollWounds,
    rerollDamage: initial.rerollDamage,
    modelCounts: initial.modelCounts,
    legacyModels: initial.legacyModels,
    defToughness: initial.defToughness,
    defSave: initial.defSave,
    defWounds: initial.defWounds,
  })

  const [attackerFaction, setAttackerFaction] = useState(
    initial.attackerFaction,
  )
  const [attackerUnitId, setAttackerUnitId] = useState(initial.attackerUnitId)
  const [attackerCharIds, setAttackerCharIds] = useState<string[]>(
    initial.attackerCharIds ?? [],
  )
  const [mode, setMode] = useState<AttackMode>(initial.mode ?? 'shooting')
  const [counts, setCounts] = useState<Record<string, number>>({})
  // per-row manual overrides (only deltas are stored)
  const [skills, setSkills] = useState<Record<string, number>>({})
  const [attackBonus, setAttackBonus] = useState<Record<string, number>>({})
  const [strengths, setStrengths] = useState<Record<string, number>>({})
  const [aps, setAps] = useState<Record<string, number>>({})
  const [damageBonus, setDamageBonus] = useState<Record<string, number>>({})
  const [extras, setExtras] = useState<Record<string, string[]>>({})
  const [rerollHits, setRerollHits] = useState<Record<string, RerollMode>>({})
  const [rerollWounds, setRerollWounds] = useState<Record<string, RerollMode>>(
    {},
  )
  const [rerollDamage, setRerollDamage] = useState<
    Record<string, DamageRerollMode>
  >({})

  const [defenderFaction, setDefenderFaction] = useState(
    initial.defenderFaction,
  )
  const [defenderUnitId, setDefenderUnitId] = useState(initial.defenderUnitId)
  const [defenderCharIds, setDefenderCharIds] = useState<string[]>(
    initial.defenderCharIds ?? [],
  )
  // model count per statline id of the defender unit
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({})
  // per-defense-group characteristic overrides (deltas only)
  const [defToughness, setDefToughness] = useState<Record<string, number>>({})
  const [defSave, setDefSave] = useState<Record<string, number>>({})
  const [defWounds, setDefWounds] = useState<Record<string, number>>({})
  // 11e: defense-group allocation order chosen by the defender
  const [groupOrder, setGroupOrder] = useState<string[] | undefined>(
    initial.groupOrder,
  )

  // saved comparison scenarios (serialized states, carried in the URL)
  const [saved, setSaved] = useState<string[]>(initial.saved ?? [])
  const [context, setContext] = useState<AttackContext>(initial.context ?? {})
  const [overrides, setOverrides] = useState<DefenderOverrides>(
    initial.overrides ?? {},
  )

  const capabilities = editionUiFor(edition)
  // an edition may serve another edition's dataset while previewing
  const dataEdition =
    editions.data?.find((e) => e.edition === edition)?.data ?? edition
  const attackerData = useFaction(dataEdition, attackerFaction)
  const defenderData = useFaction(dataEdition, defenderFaction)
  const attacker = attackerData.data?.units.find((u) => u.id === attackerUnitId)
  const attackerChars = attackerCharIds
    .slice(0, capabilities.maxAttachedCharacters)
    .map((id) => attackerData.data?.units.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined)
  const defender = defenderData.data?.units.find((u) => u.id === defenderUnitId)
  const defenderChars = defenderCharIds
    .slice(0, capabilities.maxAttachedCharacters)
    .map((id) => defenderData.data?.units.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined)

  const attackerCharsKey = attackerChars.map((u) => u.id).join(',')
  const rows = useMemo(() => {
    if (!attacker) return []
    // attached characters attack alongside the unit; their row keys are
    // namespaced so shared weapon entries don't collide with the unit's
    return [
      ...profileRows(attacker, mode),
      ...attackerChars.flatMap((char, i) =>
        profileRows(char, mode).map((r) => ({
          ...r,
          key: `c${i}.${r.key}`,
        })),
      ),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacker, attackerCharsKey, mode])
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
      setAttackBonus(pending.attackBonus ?? {})
      setStrengths(pending.strength ?? {})
      setAps(pending.ap ?? {})
      setDamageBonus(pending.damageBonus ?? {})
      setExtras(pending.extras ?? {})
      setRerollHits(pending.rerollHits ?? {})
      setRerollWounds(pending.rerollWounds ?? {})
      setRerollDamage(pending.rerollDamage ?? {})
      // URL-provided values are for the first real loadout only
      if (
        pending.counts ||
        pending.skills ||
        pending.attackBonus ||
        pending.strength ||
        pending.ap ||
        pending.damageBonus ||
        pending.extras ||
        pending.rerollHits ||
        pending.rerollWounds ||
        pending.rerollDamage
      ) {
        setPending((p) => ({
          ...p,
          counts: undefined,
          skills: undefined,
          attackBonus: undefined,
          strength: undefined,
          ap: undefined,
          damageBonus: undefined,
          extras: undefined,
          rerollHits: undefined,
          rerollWounds: undefined,
          rerollDamage: undefined,
        }))
      }
    } else {
      setCounts({})
      setSkills({})
      setAttackBonus({})
      setStrengths({})
      setAps({})
      setDamageBonus({})
      setExtras({})
      setRerollHits({})
      setRerollWounds({})
      setRerollDamage({})
    }
  }

  // reset defender configuration when the defender unit changes
  const [defenderFor, setDefenderFor] = useState<Unit>()
  if (defender !== defenderFor) {
    setDefenderFor(defender)
    if (defender) {
      const groups = defenseGroups(defender)
      const defaults = Object.fromEntries(
        groups.map((g) => [g.id, g.defaultCount]),
      )
      const next = { ...defaults, ...pending.modelCounts }
      if (pending.legacyModels !== undefined && groups[0]) {
        next[groups[0].id] = pending.legacyModels
      }
      setModelCounts(next)
      setDefToughness(pending.defToughness ?? {})
      setDefSave(pending.defSave ?? {})
      setDefWounds(pending.defWounds ?? {})
      if (defenderFor !== undefined) setGroupOrder(undefined)
      if (
        pending.modelCounts !== undefined ||
        pending.legacyModels !== undefined ||
        pending.defToughness !== undefined ||
        pending.defSave !== undefined ||
        pending.defWounds !== undefined
      ) {
        setPending((p) => ({
          ...p,
          modelCounts: undefined,
          legacyModels: undefined,
          defToughness: undefined,
          defSave: undefined,
          defWounds: undefined,
        }))
      }
    }
  }

  const defenderCharsKey = defenderChars.map((u) => u.id).join(',')
  const result = useMemo(() => {
    if (!attacker || !defender || rows.length === 0) return undefined
    return runSimulation(
      edition,
      rows,
      {
        counts,
        skills,
        attackBonus,
        strength: strengths,
        ap: aps,
        damageBonus,
        extras,
        rerollHits,
        rerollWounds,
        rerollDamage,
      },
      {
        unit: defender,
        modelCounts,
        groupOrder,
        groupToughness: defToughness,
        groupSave: defSave,
        groupWounds: defWounds,
        attachedUnits: defenderChars,
        overrides,
      },
      context,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    edition,
    attacker,
    defender,
    defenderCharsKey,
    groupOrder,
    rows,
    counts,
    skills,
    attackBonus,
    strengths,
    aps,
    damageBonus,
    extras,
    rerollHits,
    rerollWounds,
    rerollDamage,
    modelCounts,
    defToughness,
    defSave,
    defWounds,
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
      attackerCharIds,
      mode,
      counts: changed,
      skills,
      attackBonus,
      strength: strengths,
      ap: aps,
      damageBonus,
      extras,
      rerollHits,
      rerollWounds,
      rerollDamage,
      defenderFaction,
      defenderUnitId,
      defenderCharIds,
      groupOrder,
      modelCounts: defender ? modelCounts : undefined,
      defToughness,
      defSave,
      defWounds,
      context,
      overrides,
    })
  }, [
    edition,
    attackerFaction,
    attackerUnitId,
    attackerCharIds,
    mode,
    rows,
    counts,
    skills,
    attackBonus,
    strengths,
    aps,
    damageBonus,
    extras,
    rerollHits,
    rerollWounds,
    rerollDamage,
    defenderFaction,
    defenderUnitId,
    defenderCharIds,
    groupOrder,
    modelCounts,
    defToughness,
    defSave,
    defWounds,
    defender,
    context,
    overrides,
  ])
  useEffect(() => {
    const params = new URLSearchParams(hash)
    if (saved.length > 0) params.set('cmp', saved.join('|'))
    const full = params.toString()
    history.replaceState(
      null,
      '',
      full ? `#${full}` : window.location.pathname + window.location.search,
    )
  }, [hash, saved])

  const MAX_SAVED = 8
  const saveComparison = () => {
    setSaved((list) =>
      list.includes(hash) || list.length >= MAX_SAVED ? list : [...list, hash],
    )
  }
  const loadComparison = (entry: string) => {
    const params = new URLSearchParams(entry)
    if (saved.length > 0) params.set('cmp', saved.join('|'))
    window.location.hash = `#${params.toString()}`
    window.location.reload()
  }

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
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-mono text-2xl uppercase tracking-widest text-[var(--color-green)]">
          Cogitator
        </h1>
        <div className="flex items-center gap-2">
          <Button size="SM" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          {(editions.data?.length ?? 0) > 1 ? (
            // selections survive the switch: while 11e aliases the 10e
            // dataset the same units resolve, and with real 11e data a
            // stale id simply leaves the unit unselected
            <Select value={edition} onValueChange={setEdition}>
              <SelectTrigger aria-label="Edition" className="w-auto shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editions.data!.map((e) => (
                  <SelectItem key={e.edition} value={e.edition}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          edition={dataEdition}
          factionFile={attackerFaction}
          unit={attacker}
          factionUnits={attackerData.data?.units ?? []}
          attachedIds={attackerCharIds}
          maxAttached={capabilities.maxAttachedCharacters}
          mode={mode}
          rows={rows}
          counts={counts}
          skills={skills}
          attackBonus={attackBonus}
          strengths={strengths}
          aps={aps}
          damageBonus={damageBonus}
          extras={extras}
          rerollHits={rerollHits}
          rerollWounds={rerollWounds}
          rerollDamage={rerollDamage}
          onFactionChange={(f) => {
            setAttackerFaction(f)
            setAttackerUnitId(undefined)
            setAttackerCharIds([])
          }}
          onUnitChange={setAttackerUnitId}
          onAttachedChange={(i, id) =>
            setAttackerCharIds((ids) => {
              const next = [...ids]
              if (id === undefined) next.splice(i, 1)
              else next[i] = id
              return next.filter(Boolean)
            })
          }
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
          onAttackBonusChange={(key, bonus) =>
            setAttackBonus((s) => {
              const next = { ...s }
              if (bonus === undefined) delete next[key]
              else next[key] = bonus
              return next
            })
          }
          onStrengthChange={(key, strength) =>
            setStrengths((s) => {
              const next = { ...s }
              if (strength === undefined) delete next[key]
              else next[key] = strength
              return next
            })
          }
          onApChange={(key, ap) =>
            setAps((s) => {
              const next = { ...s }
              if (ap === undefined) delete next[key]
              else next[key] = ap
              return next
            })
          }
          onDamageBonusChange={(key, bonus) =>
            setDamageBonus((s) => {
              const next = { ...s }
              if (bonus === undefined) delete next[key]
              else next[key] = bonus
              return next
            })
          }
          onExtraToggle={(key, code) =>
            setExtras((s) => {
              const next = { ...s, [key]: toggleExtra(s[key] ?? [], code) }
              if (next[key].length === 0) delete next[key]
              return next
            })
          }
          onRerollHitsChange={(key, mode) =>
            setRerollHits((s) => {
              const next = { ...s }
              if (mode === undefined) delete next[key]
              else next[key] = mode
              return next
            })
          }
          onRerollWoundsChange={(key, mode) =>
            setRerollWounds((s) => {
              const next = { ...s }
              if (mode === undefined) delete next[key]
              else next[key] = mode
              return next
            })
          }
          onRerollDamageChange={(key, mode) =>
            setRerollDamage((s) => {
              const next = { ...s }
              if (mode === undefined) delete next[key]
              else next[key] = mode
              return next
            })
          }
        />
        <DefenderPanel
          edition={dataEdition}
          factionFile={defenderFaction}
          unit={defender}
          factionUnits={defenderData.data?.units ?? []}
          attachedUnits={defenderChars}
          attachedIds={defenderCharIds}
          maxAttached={capabilities.maxAttachedCharacters}
          modelCounts={modelCounts}
          groupToughness={defToughness}
          groupSave={defSave}
          groupWounds={defWounds}
          overrides={overrides}
          groupReorder={capabilities.groupReorder}
          groupOrder={groupOrder}
          onFactionChange={(f) => {
            setDefenderFaction(f)
            setDefenderUnitId(undefined)
            setDefenderCharIds([])
          }}
          onUnitChange={setDefenderUnitId}
          onAttachedChange={(i, id) =>
            setDefenderCharIds((ids) => {
              const next = [...ids]
              if (id === undefined) next.splice(i, 1)
              else next[i] = id
              return next.filter(Boolean)
            })
          }
          onModelCountChange={(id, count) =>
            setModelCounts((c) => ({ ...c, [id]: count }))
          }
          onGroupToughnessChange={(id, v) =>
            setDefToughness((s) => {
              const next = { ...s }
              if (v === undefined) delete next[id]
              else next[id] = v
              return next
            })
          }
          onGroupSaveChange={(id, v) =>
            setDefSave((s) => {
              const next = { ...s }
              if (v === undefined) delete next[id]
              else next[id] = v
              return next
            })
          }
          onGroupWoundsChange={(id, v) =>
            setDefWounds((s) => {
              const next = { ...s }
              if (v === undefined) delete next[id]
              else next[id] = v
              return next
            })
          }
          onOverridesChange={setOverrides}
          onGroupOrderChange={setGroupOrder}
        />
      </div>

      <ModifiersPanel
        situations={capabilities.situations}
        context={context}
        overrides={overrides}
        onContextChange={setContext}
        onOverridesChange={setOverrides}
      />

      <ResultsPanel
        result={result}
        defenderName={defender?.name}
        attachedNames={defenderChars.map((u) => u.name)}
        onSave={saveComparison}
        saveDisabled={saved.length >= MAX_SAVED || saved.includes(hash)}
        modelLayout={
          defender
            ? defenderModelLayout({
                unit: defender,
                modelCounts,
                groupOrder,
                groupToughness: defToughness,
                groupSave: defSave,
                groupWounds: defWounds,
                attachedUnits: defenderChars,
                overrides,
              })
            : []
        }
      />

      <ComparisonPanel
        entries={saved}
        editions={editions.data ?? []}
        onLoad={loadComparison}
        onRemove={(i) => setSaved((list) => list.filter((_, j) => j !== i))}
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
