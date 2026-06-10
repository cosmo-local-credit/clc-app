# CLC App

> Route redeemable claims across curated markets with shared standards.

[![codecov](https://codecov.io/gh/cosmo-local-credit/clc-app/branch/master/graph/badge.svg?token=WNZV9550PY)](https://codecov.io/gh/cosmo-local-credit/clc-app)

## Prerequisites

- [Vite+](https://viteplus.dev/) CLI: `curl -fsSL https://vite.plus | bash`

The pinned Node.js version is in `.node-version`. `vp install` will activate it automatically if you have a compatible runtime manager (fnm, volta, or nvm).

## Getting started

```bash
vp install
vp dev
vp build
vp test
```

The web app runs on `http://localhost:3000` during development.

## Editor setup

Install the **Vite+ extension pack** for your editor:

- **VS Code** — install `VoidZero.vite-plus-extension-pack` (recommended in `.vscode/extensions.json`)
- **Zed** — Oxlint and Oxfmt LSP configs are in `.zed/settings.json`

Format-on-save and organize-imports-on-save are wired for JS/TS/JSX/TSX and JSON files in both editors.

## Common commands

| Command          | Description                     |
| ---------------- | ------------------------------- |
| `vp dev`         | Start dev server                |
| `vp build`       | Production build                |
| `vp test`        | Run all tests                   |
| `vp check`       | Type-check + lint + format      |
| `vp check --fix` | Auto-fix lint and format issues |
| `vp lint`        | Lint only                       |
| `vp fmt --fix`   | Format only                     |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project rules, dependency guidelines, and feature structure.

## License

[AGPL-3.0](LICENSE)
