# `features/`

Each feature should be split into shared logic and web UI.

```text
features/<feature>/
  logic/
  ui/
  index.ts
```

## Meaning of each folder

- `logic/` is for shared feature code that should work in web and React Native.
- `ui/` is for web specific components.
- `index.ts` re-exports the public API for the feature.

## Rules

- `logic/` follows the same portability rules as `src/lib/`.
- `ui/` can import its own feature `logic/`.
- `ui/` must not import another feature's `ui/`.

If code needs to be shared across features, move it to shared logic or shared UI primitives.

## Why this split exists

When the mobile app is added, the goal is to reuse `logic/` and write a separate `ui/` layer for React Native. The lint rules help keep that boundary intact.
