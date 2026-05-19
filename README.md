# CLC App

## Repository layout

```text
apps/
  web/      Web app
  mobile/   Placeholder for future Expo app
packages/
  core/     Shared logic intended to work in web (PWA) and mobile
```

`packages/core` holds shared schemas, stores, query helpers, and other portable logic. Biome prevents web only imports from being used there.

## Getting started

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

The web app runs on `http://localhost:3000` during development.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project rules, dependency guidelines, and feature structure.
