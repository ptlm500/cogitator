# Cogitator

Calculate the outcome of one Warhammer 40,000 unit attacking another (shooting or melee),
with exact probability distributions. Supports 10th edition; 11th edition planned.
Unit data comes from [BSData/wh40k-10e](https://github.com/BSData/wh40k-10e).

See [PLAN.md](PLAN.md) for the implementation plan.

## Development

Toolchain is managed by [mise](https://mise.jdx.dev/) (`mise.toml`: Node 24, pnpm 11).

```bash
mise install
pnpm install
pnpm dev          # start dev server
pnpm test         # run tests
pnpm lint         # eslint
pnpm format       # prettier
pnpm build        # production build
```

UI components are [scificn-ui](https://www.scificn.dev/), vendored shadcn-style under
`src/components/ui/`. Add more with:

```bash
pnpm dlx shadcn@latest add @scificn/<component>
```

## Unit data

Unit data is generated from BattleScribe catalogues
([BSData/wh40k-10e](https://github.com/BSData/wh40k-10e)) by the scripts in
`pipeline/`, and committed under `public/data/<edition>/` (an `index.json`
plus one JSON file per faction, lazy-loaded by the app). Editions and their
pinned BSData commits live in `pipeline/bsdata-pin.json`; the pipeline
validates each regenerated dataset (faction/unit floors, every weapon
characteristic parseable) before writing.

```bash
pnpm data:build    # regenerate from the pinned BSData commits
pnpm data:update   # re-pin to BSData main HEAD and regenerate
```

`.github/workflows/refresh-data.yml` runs `data:update` weekly (and on
manual dispatch), commits the result if anything changed, and triggers a
Pages deploy.

### Adding 11th edition when it lands

1. Add an `11e` entry to `pipeline/bsdata-pin.json` pointing at the new
   BSData repo.
2. Implement `src/rules/11e/` and register it in `src/rules/index.ts`.
3. Run `pnpm data:build` — the app's edition switcher appears automatically
   once `editions.json` lists more than one edition.

## Deployment

Pushes to `main` build and deploy to GitHub Pages via `.github/workflows/deploy.yml`.
The repo's Pages setting must be set to "GitHub Actions" as the source.
