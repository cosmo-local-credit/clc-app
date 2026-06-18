# CLC App

> Route redeemable claims across curated markets with shared standards.

[![codecov](https://codecov.io/gh/cosmo-local-credit/clc-app/branch/master/graph/badge.svg?token=WNZV9550PY)](https://codecov.io/gh/cosmo-local-credit/clc-app)

## Prerequisites

- [Vite+](https://viteplus.dev/) CLI: `curl -fsSL https://vite.plus | bash`

The pinned Node.js version is in `.node-version`. `vp install` will activate it automatically.

## Getting started

```bash
vp install
vp dev apps/web
vp build
vp test
```

The web app runs on `http://localhost:3000` during development.

## Editor setup

Install the **Vite+ extension pack** for your editor:

- https://viteplus.dev/guide/ide-integration

## Common commands

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `vp dev apps/web` | Start dev server                |
| `vp build`        | Production build                |
| `vp test`         | Run all tests                   |
| `vp check`        | Type-check + lint + format      |
| `vp check --fix`  | Auto-fix lint and format issues |
| `vp lint`         | Lint only                       |
| `vp fmt --fix`    | Format only                     |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project rules, dependency guidelines, and feature structure.

## Debugging

### Chrome on Android (experimental)

Forward the device port then connect via the `chrome-devtools` MCP server in `.mcp.json`:

```shell
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

## License

[AGPL-3.0](LICENSE)
