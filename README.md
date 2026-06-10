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

## Deployment

Pushes to `main` build and deploy to GitHub Pages via `.github/workflows/deploy.yml`.
The repo's Pages setting must be set to "GitHub Actions" as the source.
