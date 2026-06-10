# Contributing

## Project principles

- Keep dependencies small and justified.
- Put shared logic in `packages/core`.
- Add tests for logic in `packages/core`.
- Keep web only code in `apps/web`.

## Repository layout

```text
apps/
  web/      Web app
  mobile/   Placeholder for a future Expo app
packages/
  core/     Shared logic for web (PWA) and mobile
```

## Platform boundary

Code in `packages/core/src/` should work in both web and React Native.

Allowed in `packages/core/src/`:

- `@tanstack/react-form`
- `@tanstack/react-query`
- `zod`
- `zustand`
- plain TypeScript
- `fetch`

Do not use these in `packages/core/src/`:

- `react-dom`
- `@tanstack/react-router`
- `@tanstack/react-start`
- `@base-ui/react`
- `sonner`
- `lucide-react`
- `@serwist/*`
- direct DOM access such as `window`, `document`, or `localStorage`

Biome enforces these boundaries.

Inside `apps/web/src/features`, one feature `ui/` folder must not import another feature `ui/` folder. Shared UI belongs in `apps/web/src/components`. Shared logic belongs in `packages/core`.

## Adding a feature

Use this structure:

```text
packages/core/src/features/<name>/logic/
  schema.ts
  store.ts
  queries.ts
  index.ts

apps/web/src/features/<name>/ui/
  <name>-form.tsx
  index.ts

apps/web/src/routes/
  <name>.tsx
```

Import shared feature logic into the web app with `@clc/core/features/<name>/logic`.

## Testing

```bash
vp test
vp test --filter @clc/core
```

Use plain Vitest for logic in `packages/core`. Use `@testing-library/react` for UI tests in `apps/web`.

## Common commands

```bash
vp dev
vp build
vp check
```

## Dependency policy

1. Add React Native compatible runtime dependencies to `packages/core/package.json`.
2. Add web only runtime dependencies to `apps/web/package.json`.
3. Keep root dependencies limited to shared tooling.
4. Prefer the existing stack unless there is a clear reason to add something new.
5. `nitro` is currently aliased to `nitro-nightly`.

## Adding the Expo app later

When `apps/mobile` is created:

1. Create the Expo app in `apps/mobile`.
2. Add `@clc/core` as a workspace dependency.
3. Configure Metro so `@clc/core/*` resolves to `packages/core/src/*`.
4. Reuse `packages/core/features/<name>/logic/`.
5. Build a mobile `ui/` layer with React Native components.
