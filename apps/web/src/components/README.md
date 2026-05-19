# `components/`

This directory is for shared web UI.

- `components/ui/` contains reusable UI primitives built on `@base-ui/react`.
- `components/` can also contain larger shared web components such as layouts or navigation.

Do not put feature specific UI here. That belongs in `src/features/<feature>/ui/`.

This directory is web only and is not intended to be reused in React Native.
