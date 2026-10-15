# CLC App

> Cosmo-Local Credit helps people and organizations support, share, and exchange goods and services.

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


## Common commands

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `vp dev apps/web`   | PWA dev server, port 3000           |
| `vp dev apps/admin` | Admin console dev server, port 3001 |
| `vp build`          | Production build                    |
| `vp test`           | Run all tests                       |
| `vp check`          | Type-check + lint + format          |
| `vp check --fix`    | Auto-fix lint and format issues     |
| `vp lint`           | Lint only                           |
| `vp fmt --fix`      | Format only                         |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project rules, dependency guidelines, and feature structure.

## License

[AGPL-3.0](LICENSE)
