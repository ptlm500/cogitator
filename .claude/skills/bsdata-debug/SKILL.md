---
name: bsdata-debug
description: Investigate incorrect unit data (wrong weapons, counts, defaults, statlines, abilities) traced to the BattleScribe/BSData extraction pipeline. Use when a datasheet in the app shows options it shouldn't, misses options it should have, duplicates entries, or has wrong default loadouts.
---

# Investigating BSData parsing issues

The app's unit data is extracted at build time from BSData BattleScribe XML
by `pipeline/extract.ts`. Most "wrong datasheet" bugs are extraction bugs:
the XML encodes intent through several indirections the extractor must
interpret. Follow this workflow end to end — past fixes (T'au missile pods,
Ravager lances, Helbrute fists) all came from it.

## Layout

- `pipeline/bsdata-pin.json` — pinned upstream repo + commit sha per edition.
  11e currently aliases the 10e dataset (`dataFrom: "10e"`).
- `pipeline/.cache/<sha>/*.cat` + `.gst` — the raw XML being parsed. The sha
  comes from the pin file; don't hardcode it.
- `public/data/10e/<faction>.json` — extracted output, committed to git
  (so `git archive HEAD public/data/10e` gives you a baseline).
- Regenerate with `mise exec -- pnpm data:build` (pinned sha) or
  `pnpm data:update` (bump pin). All toolchain commands go through
  `/opt/homebrew/bin/mise exec -- pnpm ...`; there is no bare node/npm.

Output unit shape: `models[].weapons[]` are refs
`{weaponId, defaultCount, max, choiceGroup?}` per model; `unit.weapons` maps
id → `{name, profiles[]}`; plus `looseWeapons`, `statlines`, `invuln`,
`feelNoPain`.

## Workflow

### 1. Reproduce from the extracted JSON

Dump the unit's refs before reading any XML — it tells you whether the bug
is duplication, wrong defaults, wrong maxes, or a missing/extra option:

```python
import json
d = json.load(open('public/data/10e/<faction>.json'))
u = next(x for x in d['units'] if x['name'] == '<Unit>')
wname = lambda wid: u['weapons'].get(wid, {}).get('name', wid)
for m in u['models']:
    print(m['name'], m.get('min'), m.get('max'))
    for r in m['weapons']:
        print(f"  {wname(r['weaponId']):40s} d={r['defaultCount']} m={r['max']} grp={r.get('choiceGroup','')}")
```

### 2. Find the unit in the cached XML

The same unit name appears many times (categoryLinks, entryLinks, costs,
shared entries). Find the **shared selectionEntry** the roster entryLink
targets: locate `<entryLink ... name="<Unit>" ... targetId="X"/>`, then
`id="X"`. Sibling variants of a datasheet are separate copies — make sure
you're in the right one (a past bug was a `defaultSelectionEntryId` copied
from the *other* variant, dangling in this one).

Print the structure (entries, groups, links, constraints, ids,
`defaultSelectionEntryId`, `targetId`) rather than reading raw XML; a small
regex dumper over the relevant slice is fine.

### 3. Know the encoding idioms

These are the recurring XML patterns; check each against the symptom:

- **entryLink indirection** — options live in `sharedSelectionEntries` and
  are pulled in by `entryLink targetId`. Constraints on the *link* override
  the target's. An unresolvable targetId silently drops the option.
- **Group constraints** — `selectionEntryGroup` min/max with
  `scope="parent" field="selections"` is a pick-N range; options without
  their own constraints inherit it (Ravager: pick 3 lances).
- **Compound option wrappers** — an option like "Fist with combi-bolter" is
  an upgrade entry whose *children* carry `min=1`, meaning "1 **if** this
  option is chosen", not "always equipped" (Helbrute).
- **Defaults** — `defaultSelectionEntryId` names the default child by entry
  *or link* id. It can be stale/dangling (copied from a sibling datasheet);
  a min-N group with no usable default auto-fills with its first option in
  BattleScribe, and the extractor mirrors that (`effectiveGroupDefault`).
- **Duplicate weapon entries** — wrappers embed their own copies of the same
  weapon; identical name+profiles are merged unit-wide
  (`canonicalWeaponIds`), refs merged per-slot-sum / across-slot-max
  (`mergeWeaponRefs`).
- **Visibility modifiers** — shared subtrees are specialised with `hidden`
  attributes plus `set hidden` modifiers conditioned on
  `instanceOf`/`notInstanceOf` ancestor ids (T'au drones). Evaluation is
  static and **optimistic**: hide only when definitively true, reveal unless
  definitively false. Selection-count conditions are 'unknown' — never hide
  on a guess.
- **Skipped subtrees** — `Crusade` and `Enhancements` children are excluded
  (`SKIPPED_CHILDREN`); they once leaked hundreds of abilities.
- **Abilities with bare values** — "Invulnerable Save" profiles may contain
  just "4+" in the description; name-matched regexes run first.

The machinery in `pipeline/extract.ts`: `BsIndex` (global id index),
`resolvedChildren` (resolves links, filters hidden), `CollectState`
(threads `selected` branch state and `slot` through `collectWeapons`),
`GroupRange`, `effectiveGroupDefault`, `mergeWeaponRefs`,
`canonicalWeaponIds`.

### 4. Fix and add a regression test

Tests live in `pipeline/extract.test.ts` as synthetic GST/CAT XML fixtures.
`setup(catXml?)` accepts a variant catalogue — derive edge cases with
`CAT.replace(...)` (e.g. removing or dangling a `defaultSelectionEntryId`)
instead of duplicating the fixture. Reproduce the XML *pattern*, not the
specific datasheet.

### 5. Measure dataset-wide impact

Always quantify the blast radius before committing — a one-unit fix has
repeatedly turned out to affect hundreds of units, and naive diffs produce
phantom regressions. Compare multisets, keyed by weapon **name** (ids change
when canonicalization changes):

```python
import json, glob, os
from collections import Counter
# baseline:  rm -rf /tmp/head-data && mkdir -p /tmp/head-data \
#            && git archive HEAD public/data/10e | tar -x -C /tmp/head-data
def load(d):
    return {os.path.basename(f): json.load(open(f))
            for f in glob.glob(d + '/*.json') if not f.endswith('index.json')}
def sig(u):
    wname = lambda wid: u['weapons'].get(wid, {}).get('name', wid)
    return Counter((m['name'], wname(r['weaponId']), r.get('defaultCount', 0),
                    r.get('max', 0), r.get('choiceGroup', ''))
                   for m in u.get('models', []) for r in m.get('weapons', []))
```

Report per category and **triage each before trusting the diff**:
- units changed / weapon definitions added or removed
- weapon names lost entirely (had max>0 before, gone now) — should be 0
- units whose entire default loadout vanished
- per-name capacity drops (sum of `max × model.max` decreased) — beware:
  an "old default" inflated by the very bug you fixed shows up here as a
  false regression

Spot-check the historical canaries: WE Helbrute (one fist, defaults
CCW+missile launcher+multi-melta), Drukhari Ravager (3 dark lances),
T'au Breachers (zero missile pod refs), SM Dreadnought (has defaults),
Blood Angels "Death Company ... Jump Packs [Legends]" (boltgun+CCW default).

### 6. Verify and ship

1. `mise exec -- pnpm vitest run` / `pnpm lint` / `pnpm format` / `pnpm build`
2. Browser check of the affected unit: start `pnpm dev` (port 5173), drive
   with playwright-core + system Chrome (see `scripts/smoke.mjs` for
   selector conventions — scificn Selects open via `getByLabel('Faction')`
   then `getByRole('option', ...)`; mode tabs via `getByRole('tab')`).
   Run the full `node scripts/smoke.mjs` too.
3. Commit the pipeline change **and** the regenerated `public/data/10e`
   together; include the impact numbers in the commit message.
4. Push, then `gh run watch <id>` on the `deploy.yml` run.
