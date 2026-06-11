# Cogitator — 11th Edition Support Plan

Sources: Goonhammer 11e deep dives — [Attacks & Shooting](https://www.goonhammer.com/11th-edition-40k-rules-deep-dive-attacks-and-the-shooting-phase/),
[Charge & Fight](https://www.goonhammer.com/11th-edition-40k-rules-deep-dive-the-charge-and-fight-phases/),
[Core Concepts](https://www.goonhammer.com/11th-edition-40k-rules-deep-dive-core-concepts/) (June 2026).
Final rules text and BSData (`wh40k-11e`) pending release; open questions listed at the end.

## What changes for the math (vs 10e)

1. **Hit and wound rolls are unchanged.** Same BS/WS targets, same S-vs-T table.
2. **Cover is now a -1 BS penalty on the firer**, not a save bonus — and because
   it modifies the characteristic, it stacks with ±1 to-hit roll modifiers
   beyond the cap. Stealth simply grants Cover.
3. **Save + allocation is completely reworked** (the headline change):
   - The defender splits the unit into **defense groups of identical
     (Save, Invulnerable, Wounds)**. Each Character is always its own group.
   - The defender **chooses the allocation order**, constrained: Character
     groups after all non-Character groups; groups containing a wounded model
     first.
   - For each group of identical attacks, all save dice are rolled **as one
     batch, sorted lowest-to-highest**, and consumed in that order against the
     allocation order. Low dice burn against the front groups; back groups
     (e.g. a 4++ leader) only ever face the high rolls.
   - Invulnerable saves are mandatory; a die fails only if it is below both
     the AP-modified Save and the Invuln.
   - Damage still resolves per-attack where random or against FNP.
4. **Devastating Wounds–style attacks now deal mortal wounds in addition to /
   alongside regular damage**, processed at the end of each identical-attack
   group (exact ability text pending).
5. **New shooting modes** with calculator-relevant effects:
   - _Indirect Shooting_: target gains Cover, no hit re-rolls, unmodified
     non-6 always fails — softened to "unmodified 1–3 always fails" if the
     firer Remained Stationary and a friendly spotter sees the target.
   - _Close-Quarters Shooting_: Monsters/Vehicles fire at -1 to hit with
     non-Close-Quarters weapons while Engaged; **Heavy gives no bonus while
     Engaged**.
6. **Modifier algebra is formalised**: set → multiply → add → divide →
   subtract → round up; a value set to 0/“-” stops further modifiers.
   (So half-damage now applies after Melta's addition, etc.)
7. **Characters attach at army construction**, and a unit can have **two
   attached characters: one Leader plus one Support Character**.
8. Attacks are grouped by identical profile (BS/WS, S, AP, D, abilities) and
   resolved group by group; the defender may re-order defense groups between
   attack groups when constraints allow.

## Engine plan (`src/rules/11e/`)

**Shared toolkit.** Extract `dist.ts`, `dice.ts`, and the roll-outcome helpers
from `src/rules/10e/` into `src/rules/lib/` so both editions share the exact
probability machinery. The 10e keyword parser stays 10e-specific; 11e gets its
own once final ability definitions are known.

**Hit/wound stage.** Reuse the 10e approach. Cover becomes a +1 to the needed
BS (characteristic change, outside the capped roll-modifier sum) on ranged
profiles. Indirect fire adds "unmodified floor" mechanics (only 6s hit / 1–3
always fail) and suppresses hit re-rolls; Engaged disables Heavy and applies
the close-quarters penalty for M/V profiles.

**Save/allocation stage — the new core.** The sorted-batch process is exactly
computable with a face-major DP, reusing the segment-chain state:

- Process die faces v = 1..6 in ascending order. Given `r` dice remaining
  (all ≥ v), the count showing exactly v is Binomial(r, 1/(7−v)).
- For a given defense group, a die of face v either **always fails or always
  saves** (v vs min(Sv+AP, Inv) is deterministic), so applying `n` dice of
  face v to the chain is: if it fails, n sequential damage applications
  (folding FNP and damage dists per group, as today); if it saves, the dice
  are consumed with no effect and no group progression.
- DP state: (models slain, wounds on current model) × dice remaining —
  the existing `AllocationState` plus one dimension. Mixed weapon groups
  resolve sequentially as today, re-rolling the batch per attack group.

**Defender model.** Generalise `DefenderSegment` with an `isCharacter` flag
(replacing `attachedLast`); group identity keyed on (Sv, Inv, W); segment
array order _is_ the allocation order. The engine asserts characters sort
last. Toughness for wound rolls: majority across groups (confirm 11e wording).

**Mortal wounds stage** at the end of each attack group, allocated by the
same ordering rules (pending exact DW text).

**Damage modifier algebra** module implementing the set/×/+/÷/− order for
the manual damage-modifier toggles (half damage joins -1 damage).

**Verification.** Hand-calculated small cases (e.g. 3 wounds into two groups,
enumerate all 216 sorted outcomes), plus a **Monte Carlo cross-check test**:
simulate the full 11e sequence ~200k times and assert the engine's exact
distributions match within sampling tolerance. The sorted-dice process is
intricate enough that an independent oracle is worth the test runtime.

## Data plan (`pipeline/`)

- Add the `11e` entry to `pipeline/bsdata-pin.json` once `BSData/wh40k-11e`
  exists — the multi-edition pipeline, `editions.json`, and the app's edition
  switcher already activate automatically.
- Expect schema differences to verify on first import:
  - Invulnerable save likely a first-class characteristic ("part of your
    statline") — drop the ability-text regex for 11e.
  - New/renamed weapon abilities (Close-Quarters, Indirect Fire, revised
    Devastating Wounds...).
  - Leader/Support-Character attachment is now army-construction data, so
    BSData will likely encode **which characters can join which units** —
    use it to filter the character pickers (replacing the unfiltered
    Character-keyword list).
- Set 11e validation floors after the first factions publish.

## UI plan

- **Defense group ordering** (the feature the new rules demand): the defender
  panel's group list gains move-up/move-down controls; groups split by
  (Sv, Inv, W); characters pinned to the back (Leader/Support orderable
  between themselves). Order feeds the engine directly.
- **Two attached characters** on both panels (Leader + Support Character).
- **Edition-aware modifiers panel**: per-edition toggle descriptor — 11e
  replaces the cover-save toggle with "target in cover (-1 BS)", adds
  Engaged, Indirect fire, and Stationary + spotter; drops what no longer
  exists. 10e panel unchanged.
- Results: per-group survival summary becomes more interesting (P(leader
  slain) generalises to per-group expected losses).

## Phasing

Phases 1-3 were built 2026-06-11, with 11e previewing on the 10e dataset
via a pin alias until BSData publishes wh40k-11e (phase 4).

1. **Shared-math extraction** — move dist/dice/roll helpers to
   `src/rules/lib/`, no behavior change (10e tests must pass untouched).
2. **11e engine** — sorted-batch allocation DP + cover/indirect/engaged hit
   mechanics + modifier algebra, with hand-calc tests and the Monte Carlo
   oracle. Buildable _now_ from the article-level rules.
3. **Edition-aware UI** — group reordering, dual characters, per-edition
   toggles. Mostly edition-agnostic improvements (reordering also benefits
   10e's fixed-order approximation).
4. **Data wiring** — when BSData 11e lands: pin entry, schema verification,
   11e keyword parser against final ability text, validation floors.
5. **Verification & release** — full smoke across both editions; 10e stays
   the default edition until 11e data stabilises.

## Open questions (resolve against final rules / BSData)

- Exact 11e weapon ability definitions: Sustained Hits, Lethal Hits,
  Devastating Wounds (mortals in addition to damage?), Anti-X, Rapid Fire,
  Melta, Blast thresholds, Torrent, Lance.
- Whether unmodified 1s always fail / 6s always save on the batched saving
  throws (assumed yes).
- Mixed-Toughness wound-roll rule wording in 11e.
- Whether the calculator should model mid-sequence re-ordering of defense
  groups between attack groups (v1: fixed order, like the tabletop's
  plan-up-front reality).
- "Wounded group first" constraint only matters if we add pre-wounded
  defenders — out of scope for v1.
