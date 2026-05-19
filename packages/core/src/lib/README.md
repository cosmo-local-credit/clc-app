# `lib/`

This directory contains shared infrastructure code. Everything here should work in both web and React Native.

## Rules

Do not import:

- `react`
- `react-dom`
- `@tanstack/react-router`
- `@tanstack/react-start`
- `@base-ui/react`
- `sonner`
- `lucide-react`

Do not use browser globals directly, such as `window`, `document`, or `localStorage`.

These are fine to use here:

- `zod`
- `zustand`
- `@tanstack/react-query`
- `@tanstack/react-form`
- plain TypeScript helpers

## Directory guide

- `api/`: API client and related types
- `query/`: Query client setup and query keys
- `schemas/`: shared zod schemas
- `types/`: shared TypeScript types
- `stores/`: shared zustand stores
- `forms/`: shared form helpers
- `hooks/`: portable hooks with no router or DOM code
- `utils/`: pure utility functions
- `constants/`: shared constants and maps

Biome enforces these boundaries.
