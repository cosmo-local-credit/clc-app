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
server state, `zustand` for client state, **wagmi + viem (latest stable majors)**
for chain interactions, **ConnectKit** (family.co) for wallet UI, Celo as the settlement
chain.

pnpm workspace monorepo separating logic (platform-agnostic, testable) from UI.

## Layout

```
apps/
  web/      TanStack Start PWA, mobile only — @clc/web
  admin/    TanStack Start console, desktop only — @clc/admin
packages/
  core/     Platform-agnostic domain logic — @clc/core
  api/      Shared HTTP clients + query factories — @clc/api
  i18n/     lingui catalogs (apps/web only) — @clc/i18n
```

**`apps/web` is mobile only. `apps/admin` is desktop only.** The two never share
a stylesheet, a route tree, or a service worker; they share logic through
`@clc/core` and `@clc/api`. A UI rule in this file applies to `apps/web` unless
it says otherwise.

## Platform boundary (enforced by lint overrides in `vite.config.ts`)

`packages/core/src/**` is **platform-agnostic** — these imports are blocked by
`no-restricted-imports`:

- `react-dom`, `react-dom/client`, `react-dom/server`
- `lucide-react`, `react-icons`, `sonner`
- `@base-ui/react`
- `@tanstack/react-router`, `@tanstack/react-start`, devtools
- `serwist`, `@serwist/*`
- `#/components`, `@/components` (web-only UI alias)

Allowed in core: `zod`, `zustand`, `@tanstack/react-form`, `@tanstack/react-query`.
**`react` itself is blocked** in core — it must stay React Native compatible, so
core holds schemas and pure functions, never hooks.

`packages/api/src/**` is the **shared server-state layer**: the HTTP clients for
`clc-core` plus the `queryOptions` factories over them. Unlike core it _may_
import `react` (hooks belong here, not in core), but routing, DOM, UI libraries,
Serwist, and app-private aliases (`#/`, `@/`) are all blocked. Anything an app
needs from the backend goes here so both apps get it.

Sibling features cannot import each other's `ui/` — cross-feature reuse goes via
`@clc/core`, `@clc/api`, or the app's own `components/ui/`.

| From                | Import syntax                                            |
| ------------------- | -------------------------------------------------------- |
| App → domain logic  | `@clc/core/lib/...` or `@clc/core/features/<name>/logic` |
| App → backend       | `@clc/api/queries` or `@clc/api/features/<name>/client`  |
| App → its own files | `#/components/...` or `#/features/<name>/ui`             |

Apps must not import each other. `#/` is private to whichever app owns it.

If a lint rule blocks an import inside `packages/core/`, decide whether it is a
server-state concern (move to `packages/api/`) or a UI concern (move to the app).
Don't disable the rule.

## Backend & third-party SDK boundary

The backend is a custom service in a **separate repo** — this repo is the
client only. **No serverless**: no TanStack Start server functions
(`'use server'`), no edge functions, no nitro API routes.

- Third-party API calls go through _our_ backend when the provider requires
  secret credentials. **Exception:** public APIs and APIs designed for
  client-side consumption (publicly usable API keys, no server-side secrets
  required — e.g. ArcGIS World Geocoder, MapTiler tile styles) may be called
  directly from `apps/web/`. When in doubt, prefer routing through the backend.
- Vendor SDKs (analytics, mapping, geolocation, push) live in an app, never
  `packages/core/` or `packages/api/`.
- `packages/core` stays narrow — domain types, zod schemas, business rules, pure
  functions. No network clients, no vendor SDKs, no hooks.
- `packages/api` owns the network layer — one client per backend resource plus
  the `queryOptions` factories in `@clc/api/queries`. New backend calls go here,
  not into an app, so both apps can use them.

## Commands

- `vp dev apps/web` — dev server for `@clc/web` (run from repo root)
- `vp dev apps/admin` — dev server for `@clc/admin` (port 3001)
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

The type sizes above are **`apps/web` only**. `apps/admin` uses the same font
trio but an ops-console scale (`h1` 1.5rem / `h2` 1.25rem / `h3` 1.125rem,
weight 600) defined in `apps/admin/src/styles.css`. Do not copy sizes between
the two stylesheets.

Do not import `@fontsource-variable/noto-sans` or `@fontsource-variable/roboto`
— removed. Do not add new font packages outside fonttrio.

### Mobile UI rules — `apps/web` only (hard constraints, enforced at review)

**Scope: everything in this section applies to `apps/web/` and nowhere else.**
`apps/admin/` is desktop-first and is governed by the Admin console UI rules
below instead. Do not apply these constraints to admin code, and do not relax
them in web code because admin does something differently.

`apps/web` is **mobile only (360–430px)**. Every layout decision must be made
as if there is no desktop, ever.

**Banned layout patterns:**

| Pattern                                                                | Why it is banned                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<Card>` as a page-level wrapper                                       | "Floating modal on a phone" — cards are list items / info tiles, not screens |
| `min-h-screen items-center justify-center`                             | Vertically centers a box — native screens flow top-to-bottom                 |
| `max-w-sm mx-auto` on a page root                                      | Horizontal boxing replicates desktop column; use `px-4`/`px-6` inset         |
| `<Card>` nested in `<CardContent>`, or `border p-4` inside a card body | Card-within-card is desktop chrome — use spacing + typography hierarchy      |
| `rounded-xl` / `rounded-lg` / `rounded-md` on any surface or control   | Lyra corners are square — see "Corners are square" below                     |
| `shadow-xl`, `shadow-lg`, `backdrop-blur` on primary screen surfaces   | Skeuomorphic desktop layering; mobile surfaces are flat                      |

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

**Info panels / detail tiles:** `border border-border bg-card p-4`
— flat, white, outlined, **sharp-cornered**. No shadow, no nested card chrome.
White (`bg-card`) required so the panel is distinguishable from the gray page
background.

**Corners are square.** The Lyra theme carries no surface radius: primitives set
`rounded-none` (`input`, `textarea`, `select`, `checkbox`, `switch`, `button`,
`toggle`) and panels simply omit any radius class. Do not add `rounded-xl` /
`rounded-lg` / `rounded-md` to a card, tile, panel, or form control. `rounded-full`
stays only for genuinely circular shapes — status dots, radio marks, avatars,
the 56 px receipt status badges, and the progress bar.

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

### Admin console UI rules — `apps/admin` only

Desktop-first back office for stewards and operators. Look and feel is drawn
from `~/wafer-labs/wafer-ui` (unrelated project, same stack): **Lyra** — square
corners, dense zinc surfaces, mono numerals, restrained status colour. The brand
green `--primary` carries over from `apps/web` so both read as one product.

What differs from `apps/web`:

|                        | `apps/web`          | `apps/admin`                                              |
| ---------------------- | ------------------- | --------------------------------------------------------- |
| Viewport               | 360–430px only      | Desktop; `sm:`/`md:`/`lg:`/`xl:` all allowed and expected |
| Breakpoint overrides   | Banned              | Required — tables and metric grids reflow                 |
| `<Card>` as page shell | Banned              | Still banned; screens are shell + sections                |
| Navigation             | Bottom nav          | Collapsible sidebar + `⌘K` palette                        |
| Dark mode              | Zustand theme store | Same pattern, key `clc.admin.theme`                       |
| i18n                   | lingui, en + sw     | None — English only, no `<Trans>`                         |
| Service worker         | Serwist             | Never. Not a PWA                                          |

Shared with `apps/web`: square corners, flat surfaces (no
`shadow-lg`/`backdrop-blur`), `bg-card` for anything sitting on `bg-background`,
and the font trio.

**The two apps reach square corners differently — don't cross-copy the
mechanism.** `apps/web` keeps `--radius: 0.625rem` and derives `--radius-sm/md/
lg/xl` from it, squaring corners per primitive with `rounded-none`; a new web
component is rounded until you say otherwise. `apps/admin` zeroes the
`--radius-*` tokens outright, so a new admin component is square by default and
needs no `rounded-none`. Adding `rounded-none` in admin is redundant; omitting
it in web is a bug.

Admin conventions:

- Panels and tiles: `border border-border bg-card p-4`. Section headings are
  `font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground`.
- Any figure in a column uses `font-data` (mono + tabular numerals) so it does
  not jitter as it updates.
- Tables go through `#/components/admin/data-table`. Sorting is client-side over
  one fetched page; when a surface outgrows a page, move sorting into search
  params rather than paging that component.
- Never write a new amount or address formatter. Use `formatTokenAmount` /
  `formatTokenAmountFixed` and `formatVoucherAddress` from `@clc/core`.
- When the API boundary drops rows (the catalog endpoint omits vouchers with no
  coordinates), surface the gap with the `receivedCount` delta. An admin total
  that silently under-reports is worse than no total.
- Auth is a real session, decided in one place:
  `#/features/auth/admin-session.ts` reads `GET /auth/session` and authorizes on
  `role === "SUPERADMIN"`; `#/components/layout/auth-boundary.tsx` renders the
  five states. Operators sign in with the same credentials as `apps/web` — a
  paper wallet (SIWE via `@clc/api/features/auth/siwe`) or a passkey. There is no
  stub session and no bearer-token escape hatch; don't reintroduce either.
  clc-core enforces `requireSuperAdmin` on every `/api/v2/admin` endpoint, so the
  gate here is UX only.
- A session whose `role` the backend omits is `unavailable`, never
  `unauthorized`. Denying a real superadmin sends them hunting a permission
  problem that does not exist.

**What to check in `clc-core` when admin auth misbehaves** (all in that repo's
`config.toml`, not here):

1. **CORS** — `api.cors` must list the console's origin. `http://localhost:3001`
   is already there for local dev; staging is configured separately, so verify
   before blaming the client:
   `curl -sD- -o/dev/null "https://staging.cosmolocal.credit/api/v2/vouchers?perPage=1" -H "Origin: http://localhost:3001" | grep -i access-control`
2. **Passkey origin** — `relayer.allowed_origins` is a _separate_ allowlist,
   checked against the assertion's `clientDataJSON.origin` in
   `internal/relayer/webauthn.go`. An origin missing here fails passkey sign-in
   with "origin not allowed" even for a valid superadmin. Paper-wallet sign-in is
   unaffected: the SIWE handler validates only signature, address and nonce.
3. **Relying party** — a passkey is bound to the `relayer.relying_party_id` it
   was registered under, so the console must be served from that host. Locally
   that means `http://192.168.1.20:3001`, not `localhost:3001`.

Admin's dev port lives in `apps/admin/vite.config.ts` as
`server: { port: 3001, strictPort: true }`, not in the `dev` script — otherwise
`vp dev apps/admin` from the root silently takes `apps/web`'s 3000, and both
allowlists above name the port.

### Deployment — two Cloudflare Pages projects

|              | Project     | Config                     | Host                      |
| ------------ | ----------- | -------------------------- | ------------------------- |
| `apps/web`   | `clc-app`   | `wrangler.toml` (root)     | `app.cosmolocal.credit`   |
| `apps/admin` | `clc-admin` | `apps/admin/wrangler.toml` | `admin.cosmolocal.credit` |

Both deploy from Git, configured in the Pages dashboard. Root directory stays the
repository root for both — the build command selects the app:

| Project     | Build command                    | Build output directory |
| ----------- | -------------------------------- | ---------------------- |
| `clc-app`   | `pnpm --filter @clc/web build`   | `apps/web/dist`        |
| `clc-admin` | `pnpm --filter @clc/admin build` | `apps/admin/dist`      |

No `NITRO_PRESET` is needed. Nitro maps Cloudflare's `CF_PAGES` variable to the
`cloudflare-pages` preset on its own, which is why the same `build` script emits
`dist/` on Pages and `.output/` locally. `pnpm build:cf` / `build:cf:admin` set the
preset explicitly and exist only to reproduce the Pages artifact on a laptop —
pair either with `wrangler pages dev apps/<app>/dist`.

**`VITE_*` values must be set as dashboard environment variables on each project,
not as Wrangler `[vars]`.** `vars` are Function bindings delivered at runtime;
`VITE_` values are inlined into the client bundle at build time from the build's
process environment. A value set only in a Wrangler config reaches the worker and
never the browser — verified by building admin with staging in `[vars]` and
localhost in `.env`: `dist/assets` got localhost, `dist/_worker.js` got staging.
Admin needs exactly four: `VITE_API_URL`, `VITE_RELAYER_URL`,
`VITE_RELYING_PARTY_ID`, `VITE_CHAIN_ID`.

**Which Wrangler config a build uses is decided by the build command, not the root
directory.** Both projects build from the repository root, but
`pnpm --filter @clc/admin build` runs the script with `apps/admin` as its working
directory, and Nitro resolves the Wrangler config from there. So admin picks up
`apps/admin/wrangler.toml` — `clc-admin` — while the root `wrangler.toml`
(`clc-app`) is what a web build resolves. Nitro then _generates_ the config the
deploy actually uses, at `dist/_worker.js/wrangler.json`, and points
`.wrangler/deploy/config.json` at it; the checked-in file only seeds it. Hence the
build-time warning that `pages_build_output_dir` "is overridden and will be
ignored" — Nitro rewrites that path itself.

Separate projects, not one project with two paths: a Pages project has a single
build output, and serving the console under the app's origin would place it inside
the scope of `apps/web`'s service worker.

**Two things are load-bearing across both hosts:**

1. **The session cookie is scoped to the registrable domain.** clc-core sets it on
   its own host with `SameSite=Lax`, so any client must share
   `cosmolocal.credit` with the API. A console on a _different_ registrable domain
   (`admin.appcosmolocal.credit`, say) gets a 200 from `/auth/signin` and then a
   204 from `/auth/session`, because the browser never stored the cookie. That
   would need `SameSite=None; Secure; Partitioned` on the backend.
2. **`VITE_RELYING_PARTY_ID` is `cosmolocal.credit` in both projects** — the parent
   domain, so one passkey works on either host. It must equal
   `relayer.relying_party_id` in clc-core. `resolveRelyingPartyId` only honours the
   configured value when it is a suffix of the serving host, so `*.pages.dev`
   preview deploys still fall back to their own hostname and keep their own
   passkeys. Changing this value invalidates existing passkeys: WebAuthn
   credentials cannot be re-scoped, so anyone registered under the old relying
   party must enrol again. Paper wallets are unaffected.

Each admin deploy also needs its origin in **both** clc-core allowlists —
`api.cors` and `relayer.allowed_origins` — per the numbered list above.

### Forms & validation

TanStack Form 1.32+ accepts zod 4 Standard Schema directly — no adapter. For
field error display always use `getFieldError(field.state.meta.errors)` from
`#/lib/forms`. Never `.join()` raw errors; Standard Schema returns issue
objects, not strings.

### Internationalization (lingui)

**`apps/web` only — `apps/admin` is English-only and has no lingui wiring.** Do
not add `<Trans>` or the `t` macro to admin code.

User-facing copy in `apps/web` is translated with lingui (`<Trans>` / the `t`
macro from `@lingui/react/macro`). The **`.po` catalogs are the source of truth**:
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

#### Navigation history

- Keep tabs in typed `search` params and use `<Link>` so user navigation pushes
  history by default. Selecting the active tab must be a no-op.
- Use `replace` only for redirects/normalization or when leaving a transient
  screen that Back must not reopen.
- App Back controls use `useCanGoBack()` plus `router.history.back()`, with an
  in-app fallback for direct/deep-linked loads.
- Cover new navigation flows with a `createMemoryHistory` Back regression test.

`@tanstack/react-query` is wired in `apps/web/src/router.tsx` via
`setupRouterSsrQueryIntegration`. No RHF, no Redux, no Jotai.

### Web3: wagmi + viem + ConnectKit

- Use the latest stable major releases of **wagmi** and **viem**. Do not retain
  stale major-version gates in project guidance. Follow upstream migration docs
  during major upgrades and remove deprecated compatibility aliases in the same
  change.
- **wagmi** owns React hooks + connector state (internally zustand); **viem**
  owns chain primitives (clients, contracts, type-safe ABIs); **ConnectKit**
  (family.co) owns wallet UX via `<ConnectKitProvider>` +
  `<ConnectKitButton />`. Don't roll your own connect modal.
- Read wallet/chain state from wagmi hooks at point of use; don't mirror.
- For custom chain reads, prefer `useClient`/`getClient` with individually
  imported `viem/actions`. Do not use fully decorated `usePublicClient`,
  `getPublicClient`, `useWalletClient`, or `getWalletClient` by default; they
  attach complete action sets and can materially increase bundle size.
- Pure-TS contract helpers, ABIs, and chain config can live in `packages/core/`
  using viem clients and actions. React hooks (`useConnection`,
  `useReadContract`, etc.) and wagmi actions stay in `apps/web/`.

### Serwist (PWA)

`apps/web` only. Custom Vite plugin at `apps/web/plugins/serwist.ts`, worker
source at `apps/web/src/sw.ts`. Don't import serwist under `packages/core/`,
`packages/api/`, or `apps/admin/` — the admin console must never register a
service worker.

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
  `<app>/src/routes/`; move page components, loaders, reusable UI into
  non-route modules. Avoid extra named exports — TanStack will warn they
  can't be code-split.
- Don't configure a route-level `notFoundComponent` or router-level
  `defaultNotFoundComponent`. Don't rely on TanStack Router's default
  `<p>Not Found</p>`.
- Tests colocated under any `src/routes/` must be prefixed with `-`
  (e.g. `-signup.test.tsx`) so TanStack Router doesn't treat them as routes.
- Don't edit `routeTree.gen.ts` in either app — auto-generated. Edit route
  files under `src/routes/` and let the generator regenerate it.
- Don't introduce new state libs (Redux, Jotai). Zustand is the answer.
- Don't introduce new form libs (RHF). TanStack Form is the answer.
- Don't roll your own wallet connect button — use ConnectKit.
- Don't import `radix-ui` or `@radix-ui/*` — port shadcn to Base UI.
- **In `apps/web`:** don't build desktop layouts or add `md:`/`lg:`/`xl:`
  overrides, and don't violate the Mobile UI rules — re-read them before writing
  layout. **In `apps/admin`:** breakpoints are expected; follow the Admin console
  UI rules instead.
- Don't add `next-themes` to `apps/admin` — it uses the same Zustand theme store
  pattern as `apps/web`, with a pre-paint bootstrap script in `__root.tsx`.
- Don't put icons outside `lucide-react` (shadcn internals) or `react-icons`.
- Don't import app-only deps or third-party SDKs from `packages/core/` or
  `packages/api/` — lint catches the named ones; assume any new vendor SDK is
  app-only by default.
- Don't import one app from another, and don't reach into another app's `#/`.
  Shared code goes to `@clc/core` (pure) or `@clc/api` (network).
- Don't duplicate a client or formatter that already exists in `@clc/core` or
  `@clc/api`. Check both before writing one.
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
