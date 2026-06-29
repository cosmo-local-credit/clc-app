# clc-app

A mobile-first PWA for community-based exchange via vouchers and commitment
pools. Users sign up, get a wallet, on-ramp funds, join local pools, issue and
redeem vouchers, swap between pools, browse marketplaces, and off-ramp to cash.
Settled on **Celo** for on-chain auditability. Mental model: Sarafu.

**Actors:** users (hold / send / redeem), service providers (issue vouchers),
stewards (manage pools, approve vouchers, set limits/fees), supporters (fund
or seed pools).

**Core flows:** signup + wallet onboarding → on-ramp → join/create pool →
create voucher → send/swap/redeem → marketplace → off-ramp.

## Stack

TanStack Start (Vite + Nitro 3), Serwist PWA, shadcn on **Base UI** (not Radix),
`lucide-react` for shadcn internals, `react-icons` for app icons, `sonner` for
toasts, TanStack Form + zod 4 (Standard Schema), `@tanstack/react-query` for
server state, `zustand` for client state, **wagmi v2 + viem** for chain
interactions, **ConnectKit** (family.co) for wallet UI, Celo as the settlement
chain.

pnpm workspace monorepo separating logic (platform-agnostic, testable) from UI.

## Layout

```
apps/
  web/      TanStack Start PWA — @clc/web
packages/
  core/     Platform-agnostic logic — @clc/core
```

## Platform boundary (enforced by biome.json)

`packages/core/src/**` is **platform-agnostic** — these imports are blocked by
biome `noRestrictedImports`:

- `react-dom`, `react-dom/client`, `react-dom/server`
- `lucide-react`, `react-icons`, `sonner`
- `@base-ui/react`
- `@tanstack/react-router`, `@tanstack/react-start`, devtools
- `serwist`, `@serwist/*`
- `#/components`, `@/components` (web-only UI alias)

Allowed in core: `zod`, `zustand`, `@tanstack/react-form`, `@tanstack/react-query`.

Sibling features cannot import each other's `ui/` — cross-feature reuse goes via
`@clc/core` or `apps/web/src/components/ui/`.

| From             | Import syntax                                            |
| ---------------- | -------------------------------------------------------- |
| Web → core logic | `@clc/core/lib/...` or `@clc/core/features/<name>/logic` |
| Web → web files  | `#/components/...` or `#/features/<name>/ui`             |

If biome blocks an import inside `packages/core/`, push the web concern into
`apps/web/`. Don't disable the rule.

## Backend & third-party SDK boundary

The backend is a custom service in a **separate repo** — this repo is the
client only. **No serverless**: no TanStack Start server functions
(`'use server'`), no edge functions, no nitro API routes.

- Third-party API calls go through _our_ backend when the provider requires
  secret credentials. **Exception:** public APIs and APIs designed for
  client-side consumption (publicly usable API keys, no server-side secrets
  required — e.g. ArcGIS World Geocoder, MapTiler tile styles) may be called
  directly from `apps/web/`. When in doubt, prefer routing through the backend.
- Vendor SDKs (analytics, mapping, geolocation, push) live in `apps/web/`,
  never `packages/core/`.
- `packages/core` stays narrow — domain types, zod schemas, business rules,
  framework-agnostic hooks. No network clients, no vendor SDKs.

## Commands

- `vp dev apps/web` — dev server for `@clc/web` (run from repo root)
- `vp install` — install deps after pulling remote changes
- `vp check` — biome (lint + format + imports). Always run after edits.
- `vp test` — vitest across all packages
- **Do not auto-run** `vp build` — slow, surfaces env-specific issues.

## Skill / MCP routing

Trigger conditions are concrete — when the condition holds, invoke the named
tool. Anything outside the sanctioned list is out of scope unless the user
names it explicitly.

### Skills (activation triggers)

| When editing or asked to…                                        | Use skill                 |
| ---------------------------------------------------------------- | ------------------------- |
| Route files, loaders, typed search params, route-tree boundaries | `tanstack-router`         |
| Query keys, hooks, mutations, invalidation, suspense queries     | `tanstack-query`          |
| A change spans loaders + query cache + hydration                 | `tanstack-integration`    |
| UI components, composition, a11y, design tokens, mobile layout   | `frontend-ui-engineering` |
| Debug a real bug — preferred over `/investigate`                 | `diagnose`                |
| Define a feature and TDD it (red → green → refactor)             | `tdd`                     |
| Throwaway prototype to validate a design direction               | `prototype`               |
| Stress-test a plan or design before implementing                 | `grill-me`                |
| Step back and re-frame the approach                              | `zoom-out`                |

**Do not use `tanstack-start` in this repo.** Server functions, Nitro routes,
and SSR middleware are out of scope (see backend boundary). For router/SSR
shell concerns use `tanstack-router`.

**Sanctioned skill set:** `tanstack-router`, `tanstack-query`,
`tanstack-integration`, `frontend-ui-engineering`, `diagnose`, `tdd`,
`prototype`, `grill-me`, `zoom-out`.

### MCP

| When you need…                                                                         | Use MCP     |
| -------------------------------------------------------------------------------------- | ----------- |
| Live library docs (React, wagmi, viem, ConnectKit, Tailwind, Serwist, zod, Base UI, …) | `context7`  |
| Add or inspect a shadcn component                                                      | `shadcn`    |
| Browser automation, screenshot, dogfood                                                | `charlotte` |

## Stack notes

### Components

Install via the `shadcn` MCP and port primitives to `@base-ui/react` (no
`radix-ui` / `@radix-ui/*`). Size for mobile viewports only (360–430px); no
`md:` / `lg:` / `xl:` overrides.

`lucide-react` for shadcn internals only. App icons via `react-icons` (e.g.
`import { FaGithub } from "react-icons/fa"`). No hugeicons.

### Typography (locked — do not change fonts without updating this section)

Font pairing: **Plus Jakarta Sans** (headings) + **Inter** (body) +
**JetBrains Mono** (code/addresses). Managed via [fonttrio](https://fonttrio.xyz):
`bunx shadcn@latest add https://www.fonttrio.xyz/r/product.json -c apps/web`.

| Token                             | Font                       | Use                                  |
| --------------------------------- | -------------------------- | ------------------------------------ |
| `--font-heading` / `font-heading` | Plus Jakarta Sans Variable | `h1`–`h6`, display, screen titles    |
| `--font-sans` / `font-sans`       | Inter Variable             | body, labels, paragraphs, UI copy    |
| `--font-mono` / `font-mono`       | JetBrains Mono Variable    | wallet addresses, keys, code, hashes |

**Background:** `oklch(0.965 0 0)` — light neutral gray, not pure white.
Cards and sheets use `bg-card` (`oklch(1 0 0)`, pure white) to appear naturally
elevated against the background.

**Mobile type sizes:**

| Element    | Size             | Weight | Letter-spacing |
| ---------- | ---------------- | ------ | -------------- |
| `h1`       | 1.75rem          | 700    | −0.025em       |
| `h2`       | 1.375rem         | 600    | −0.02em        |
| `h3`       | 1.125rem         | 600    | −0.015em       |
| `body / p` | 0.9375rem (15px) | —      | —              |

Page titles use one locked mobile style everywhere: `h1` at 1.75rem, weight
700, tight line height (`font-heading text-[1.75rem] font-bold leading-tight`).
Do not mix page-title sizes such as `text-2xl` on one screen and base `h1` on
another.

No desktop heading sizes (`text-4xl`, `text-5xl`, `text-6xl`). On 360–430px
the largest heading is the base `h1` (1.75rem).

Do not import `@fontsource-variable/noto-sans` or `@fontsource-variable/roboto`
— removed. Do not add new font packages outside fonttrio.

### Mobile UI rules (hard constraints — enforced at review)

This app is **mobile only (360–430px)**. Every layout decision must be made
as if there is no desktop, ever.

**Banned layout patterns:**

| Pattern                                                                           | Why it is banned                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<Card>` as a page-level wrapper                                                  | "Floating modal on a phone" — cards are list items / info tiles, not screens |
| `min-h-screen items-center justify-center`                                        | Vertically centers a box — native screens flow top-to-bottom                 |
| `max-w-sm mx-auto` on a page root                                                 | Horizontal boxing replicates desktop column; use `px-4`/`px-6` inset         |
| `<Card>` nested in `<CardContent>`, or `rounded-xl border p-4` inside a card body | Card-within-card is desktop chrome — use spacing + typography hierarchy      |
| `shadow-xl`, `shadow-lg`, `backdrop-blur` on primary screen surfaces              | Skeuomorphic desktop layering; mobile surfaces are flat                      |

**Canonical page scaffold:**

```tsx
// Full-bleed screen — no card wrapper, no centering
<div className="flex min-h-screen flex-col bg-background px-6 pb-12 pt-20">
  {/* Hero / header section */}
  <div className="mb-10 flex flex-col items-center gap-4 text-center">
    {/* icon, h1, p — no Card */}
  </div>

  {/* Content sections — plain divs, spacing only */}
  <div className="space-y-3">{/* actions, lists, info panels */}</div>
</div>
```

**Info panels / detail tiles:** `rounded-xl border border-border bg-card p-4`
— flat, white, outlined. No shadow, no nested card chrome. White (`bg-card`)
required so the panel is distinguishable from the gray page background.

**Wallet amount fields:** Use `WalletAmountInput` from
`apps/web/src/features/wallet/ui/amount-input.tsx` for send, swap, top-up, and
similar wallet amount entry. Do not inline borderless transparent amount-input
composites in wallet screens; the shared component owns the visible `bg-card`
surface, focus, error, and disabled states.

**Touch targets:** Primary CTA buttons `h-11` (44 px — iOS HIG minimum).
Inputs use default `h-9`; don't override with `h-11`.

**Surface colors — always distinguish from background:**

| Element            | Background                  | Why                                 |
| ------------------ | --------------------------- | ----------------------------------- |
| Page / screen root | `bg-background` (gray)      | Base canvas                         |
| Input              | `bg-card` (white)           | Must not blend into gray background |
| Outline button     | `bg-card` (white)           | Must not blend into gray background |
| Info panel / tile  | `bg-card` + `border-border` | Flat outlined white tile, no shadow |
| Primary button     | `bg-primary`                | Intentional colour contrast         |

Never use `bg-background` or `bg-transparent` for interactive elements (inputs,
buttons) placed on the gray page background — they become invisible.

**Self-check before writing any layout:**

> "Would this look like a card floating in the middle of a phone screen?"
> If yes — remove the card, remove the centering, flow content top-to-bottom.
> "Does this interactive element blend into the gray background?"
> If yes — use `bg-card` instead of `bg-background` or `bg-transparent`.

### Forms & validation

TanStack Form 1.32+ accepts zod 4 Standard Schema directly — no adapter. For
field error display always use `getFieldError(field.state.meta.errors)` from
`#/lib/forms`. Never `.join()` raw errors; Standard Schema returns issue
objects, not strings.

### Internationalization (lingui)

User-facing copy is translated with lingui (`<Trans>` / the `t` macro from
`@lingui/react/macro`). The **`.po` catalogs are the source of truth**:
`packages/i18n/src/catalogs/{en,sw}/messages.po`. They are compiled in-memory by
`@lingui/vite-plugin` (wired into dev, build, and `vitest.config.ts`) — there is
**no `lingui compile` step** and the generated `messages.ts` files are gitignored
(do not import or commit them).

**Hard rule — after adding or changing any `<Trans>` / `t` string you MUST run
`pnpm i18n:extract`** (from the repo root) and commit the updated `.po` files.
Skipping this leaves the new keys out of the catalogs: English silently falls
back to the source text, but every other locale (e.g. `sw`) is left untranslated.
Then fill in the new `msgstr ""` entries in each non-English catalog. This was
the `7f5ba80` regression fix — keep it intact.

### Client / server / URL state

Pick the right home for each kind of state. Misclassifying state — usually by
copying server data into Zustand "for global access" — is the most common
cause of stale UI and duplicated logic.

| State                                         | Lives in                                      |
| --------------------------------------------- | --------------------------------------------- |
| Server / async (incl. IndexedDB, queues)      | `@tanstack/react-query`                       |
| Filters, pagination, sorting, search, tabs    | TanStack Router typed `search` params         |
| Form fields, validation, submission           | `@tanstack/react-form` + zod                  |
| Wallet / chain / connector                    | `wagmi` hooks (wagmi uses zustand internally) |
| Component-scoped UI (modal open, hover)       | `useState`                                    |
| Cross-route, non-URL, non-server client state | `zustand`                                     |

**Derive, don't store.** Combine multiple queries via a custom hook that calls
them and computes — hooks have no state of their own and queries are cached.
Never copy query results into Zustand (two sources of truth → stale UI). Same
for wagmi: read from hooks at point of use, don't mirror chain/account.

`@tanstack/react-query` is wired in `apps/web/src/router.tsx` via
`setupRouterSsrQueryIntegration`. No RHF, no Redux, no Jotai.

### Web3: wagmi + viem + ConnectKit

- **wagmi v2** for React hooks + connector state (internally zustand);
  **viem** for chain primitives (clients, contracts, type-safe ABIs);
  **ConnectKit** (family.co) for wallet UX — `<ConnectKitProvider>` +
  `<ConnectKitButton />`. Don't roll your own connect modal.
- Read wallet/chain state from wagmi hooks at point of use; don't mirror.
- Pure-TS contract helpers, ABIs, chain config can live in `packages/core/`
  using `wagmi/core` actions + viem clients. React hooks (`useAccount`,
  `useReadContract`, etc.) stay in `apps/web/`.

### Serwist (PWA)

Custom Vite plugin at `apps/web/plugins/serwist.ts`, worker source at
`apps/web/src/sw.ts`. Don't import serwist anywhere under `packages/core/`.

### TanStack CLI (TanStack docs only)

Use the `tanstack` CLI to search **TanStack docs only** — not other libraries,
not for scaffolding. For non-TanStack libraries use Context7 MCP.

```sh
tanstack search-docs "server functions" --library start --json
tanstack doc query framework/react/overview --json
```

Libraries: `router`, `query`, `start`, `form`, `table`, `virtual`, `store`,
`pacer`, `ranger`, `db`.

### nitro alias quirk

`nitro` is aliased to `nitro-nightly` in `apps/web/package.json`. `.npmrc` has
`public-hoist-pattern[]=nitro` so pnpm hoists the symlink, letting
`nitro-nightly` self-resolve. If nitro resolution breaks, check that hoist
pattern first.

## Tone & style

- No emojis in code, commits, PR titles, or comments.
- No fluff. Technical prose only.
- Be kind but direct.
- Answer the question before making edits.

## Code quality

- No `any` unless absolutely necessary.
- Read files in full before wide-ranging changes — don't rely on snippets.
- Check `node_modules` for external types instead of guessing.
- No inline imports — no `await import("./foo")`, no `import("pkg").Type`.
- Never downgrade/remove code to silence type errors from outdated deps; upgrade.
- Single-line helpers with one call site are forbidden — inline them.
- Don't preserve backward compatibility unless explicitly asked.
- Always ask before removing functionality that appears intentional.

## Token discipline

- Library API/syntax questions → **Context7 MCP** first, training memory second.
- Prefer the sanctioned skill set above.
- Broad codebase exploration → delegate to a sub-agent.
- Don't tail/cat large files via Bash — use `Read` with `limit`/`offset`.

## What NOT to do

- TanStack Router route files stay thin. Export `Route` from files under
  `apps/web/src/routes/`; move page components, loaders, reusable UI into
  non-route modules. Avoid extra named exports — TanStack will warn they
  can't be code-split.
- Don't configure a route-level `notFoundComponent` or router-level
  `defaultNotFoundComponent`. Don't rely on TanStack Router's default
  `<p>Not Found</p>`.
- Tests colocated under `apps/web/src/routes/` must be prefixed with `-`
  (e.g. `-signup.test.tsx`) so TanStack Router doesn't treat them as routes.
- Don't edit `apps/web/src/routeTree.gen.ts` — auto-generated. Edit route
  files under `src/routes/` and let the generator regenerate it.
- Don't introduce new state libs (Redux, Jotai). Zustand is the answer.
- Don't introduce new form libs (RHF). TanStack Form is the answer.
- Don't roll your own wallet connect button — use ConnectKit.
- Don't import `radix-ui` or `@radix-ui/*` — port shadcn to Base UI.
- Don't build desktop layouts or add `md:` / `lg:` / `xl:` overrides.
- Don't violate the Mobile UI rules section — re-read it before writing layout.
- Don't put icons outside `lucide-react` (shadcn internals) or `react-icons`.
- Don't import web-only deps or third-party SDKs from `packages/core/` —
  biome catches named ones; assume any new vendor SDK is web-only by default.
- Don't bundle large refactors with unrelated bug fixes.
- Don't run `pnpm build` proactively.
- Don't create documentation files (`*.md`, `README.md`) unless asked.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.
