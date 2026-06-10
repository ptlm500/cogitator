# Cogitator — Implementation Plan

A static web app for calculating the effects of one Warhammer 40k unit attacking another
(shooting or melee). Targets 10th edition now, with 11th edition support planned.
Deployed to GitHub Pages. Unit data sourced from [BSData/wh40k-10e](https://github.com/BSData/wh40k-10e)
(BattleScribe format).

## Decisions

- **Stack**: React + Vite + TypeScript, static export to GitHub Pages — always on the
  latest versions (as of 2026-06-10: React 19.2, Vite 8.0, TypeScript 6.0, Vitest 4.1)
- **Toolchain**: Node 24 + pnpm 11, managed via mise (`mise.toml` in repo root)
- **UI components**: [scificn-ui](https://www.scificn.dev/) — shadcn-style copy-paste
  library (Radix + Tailwind + CVA) with a retro sci-fi aesthetic. Installed via the shadcn
  CLI against the `https://scificn.dev/r` registry (`pnpm dlx shadcn@latest add @scificn/<name>`),
  plus its `globals.css` design tokens imported at the root. Its chart components
  (bar/line/radar/heatmap) cover the distribution charts; `terminal`/`status grid`/`panel`
  suit the cogitator theme.
- **Output**: full probability distributions (expected damage / models slain, probability
  charts, chance-to-kill-X), computed with exact math (distribution convolution), not Monte Carlo
- **Rules scope (v1)**: weapon keywords auto-applied from data (Sustained Hits, Lethal Hits,
  Anti-X, Twin-linked, Rapid Fire, Blast, Melta, Torrent, Heavy, Lance, Devastating Wounds,
  Hazardous, Ignores Cover) + manual toggles for re-rolls, ±1 to hit/wound, cover, FNP,
  damage reduction, invuln override. No free-form ability-text parsing in v1.
- **Attack model**: whole unit with editable loadout — default composition pre-selected,
  user can adjust model counts and swap wargear

## Architecture

### 1. Data pipeline (build-time Node script, `pipeline/`)

BattleScribe `.cat` files are large (up to ~3.8MB), deeply nested XML with cross-file links
(catalogueLinks to shared Library catalogues, sharedSelectionEntries, entryLinks, infoLinks).
Parsing this in the browser is a non-starter, so:

1. Fetch `.gst` + all `.cat` files from BSData/wh40k-10e (pinned to a commit SHA, recorded in output)
2. Resolve catalogue links and shared entries into self-contained unit definitions
3. Extract per unit:
   - name, faction, keywords
   - model composition (model types, min/max counts, default counts)
   - defensive profile per model: T, Sv, W (+ invuln/FNP where machine-readable)
   - weapon profiles (ranged + melee): Range, A, BS/WS, S, AP, D, weapon keywords
   - wargear options (which models can swap which weapons)
4. Emit `public/data/10e/index.json` (faction list) + one compact JSON per faction (lazy-loaded)
5. Run via scheduled GitHub Action to track BSData updates; commit refreshed JSON

### 2. Math engine (`src/rules/10e/`)

Edition-versioned module behind a common interface. Attack sequence as exact probability
distributions:

```
attacks (flat, D3/D6+X, Blast, Rapid Fire)
  → hits (Torrent auto-hit, crit threshold, Sustained Hits, Lethal Hits, re-rolls, ±1)
  → wounds (S vs T table, Anti-X, Twin-linked, re-rolls, ±1)
  → unsaved (Sv vs AP, invuln, cover, Devastating Wounds bypass)
  → damage (flat/variable D, Melta, FNP, damage reduction)
  → models slain (per-model wound pools, 10e no-spillover)
```

Heaviest unit-test coverage lives here, with hand-calculated fixtures
(e.g. 10 bolt rifle shots into Plague Marines).

### 3. UI (`src/`)

- Attacker panel: faction → unit → loadout editor (model counts, wargear), shooting/melee toggle
- Defender panel: faction → unit → unit size
- Modifier toggles (the manual rules layer above)
- Results panel: expected values, distribution chart (damage + models slain), kill probabilities
- Shareable URL state

## 11th edition readiness

Edition is a first-class dimension throughout:

- data: `public/data/10e/` now, `public/data/11e/` later (pipeline re-pointed at the future BSData repo)
- rules: `src/rules/10e/` and `src/rules/11e/` implementing a shared `RulesEngine` interface
- UI: edition switcher once 11e data exists

The detailed 11e implementation plan (new save/allocation system, defender
group ordering, edition-aware UI) lives in [PLAN-11E.md](PLAN-11E.md).

## Phases

1. **Scaffold** — Vite + React + TS, Tailwind + shadcn init + scificn registry/globals,
   ESLint/Prettier, Vitest, GitHub Actions deploy to Pages
2. **Data pipeline** — BattleScribe parser, resolve links, emit faction JSON; snapshot a few
   factions as test fixtures
3. **Math engine** — full attack sequence + weapon keywords, exact distributions, unit tests
4. **UI core** — attacker/defender selection, loadout editing, results with charts
5. **Modifiers & polish** — manual toggle layer, shareable URLs, mobile layout
6. **Automation & 11e prep** — scheduled data refresh action, edition abstraction proven out
