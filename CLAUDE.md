# clc-app

A mobile-first PWA for community-based exchange via vouchers and commitment
pools. Users sign up, get a wallet, on-ramp funds, join local pools, issue and
redeem vouchers, swap between pools, browse marketplaces, and off-ramp to cash.
Settled on **Gnosis** for on-chain auditability. Mental model: Sarafu.

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
for chain interactions, **ConnectKit** (family.co) for wallet UI, Gnosis as the settlement
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

**Wallet amount inputs:** New or migrated transactional amount controls use
`WalletAmountInput` from `#/components/wallet`. The component owns the square
white surface, visible border, amount typography, placeholder, and focus,
invalid, and disabled states. Screens continue to own token selection, parsing,
sanitization, precision, quoting, and validation. Do not add new borderless or
transparent composite amount inputs. Pool Swap uses this pattern; Send, Add
stables, and Withdraw remain legacy migrations tracked by issue #52.

**Self-check before writing any layout:**

> "Would this look like a card floating in the middle of a phone screen?"
> If yes — remove the card, remove the centering, flow content top-to-bottom.
> "Does this interactive element blend into the gray background?"
> If yes — use `bg-card` instead of `bg-background` or `bg-transparent`.

### Admin console UI rules — `apps/admin` only

Desktop-first back office for stewards and operators. Look and feel is drawn
from `~/wafer-labs/wafer-ui` (unrelated project, same stack): **Lyra** — square
corners, dense zinc surfaces, mono numerals, restrained status colour. `--primary`
follows `VITE_BRAND` (green on prod, red on staging) so both apps on one
environment read as one product.

What differs from `apps/web`:

|                        | `apps/web`                                         | `apps/admin`                                              |
| ---------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Viewport               | 360–430px only                                     | Desktop; `sm:`/`md:`/`lg:`/`xl:` all allowed and expected |
| Breakpoint overrides   | Banned                                             | Required — tables and metric grids reflow                 |
| `<Card>` as page shell | Banned                                             | Still banned; screens are shell + sections                |
| Navigation             | Bottom nav                                         | Collapsible sidebar + `⌘K` palette                        |
| Dark mode              | Zustand theme store                                | Same pattern, key `clc.admin.theme`                       |
| i18n                   | lingui, ar + dz + en + es + fr + it + pt + sr + sw | None — English only, no `<Trans>`                         |
| Service worker         | Serwist                                            | Never. Not a PWA                                          |

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

**One scoped exception: the NFC card writer.** Writing a batch onto NFC cards
happens standing at a table with an Android phone in one hand, because Web NFC
exists only in Chrome on Android. The writer screen
(`apps/admin/src/features/paper-wallets/nfc/`) is therefore the one admin
surface laid out mobile-first: its base classes target a 360–430px phone and
breakpoints only widen it. The batch setup form keeps working on a phone because
it already collapses, not because it is mobile-first. Every other admin surface
stays desktop-first; do not cite this exception to relax one.

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
   `curl -sD- -o/dev/null "https://gnosis-staging.cosmolocal.credit/api/v2/vouchers?perPage=1" -H "Origin: http://localhost:3001" | grep -i access-control`
2. **Passkey origin** — `relayer.allowed_origins` is a _separate_ allowlist,
   checked against the assertion's `clientDataJSON.origin` in
   `internal/relayer/webauthn.go`. An origin missing here fails passkey sign-in
   with "origin not allowed" even for a valid superadmin. Paper-wallet sign-in is
   unaffected: the SIWE handler validates only signature, address and nonce.
3. **Relying party** — a passkey is bound to the `relayer.relying_party_id` it
   was registered under, so the console must be served from that host. Locally
   that means `http://192.168.1.14:3001`, not `localhost:3001`.

Admin's dev port lives in `apps/admin/vite.config.ts` as
`server: { port: 3001, strictPort: true }`, not in the `dev` script — otherwise
`vp dev apps/admin` from the root silently takes `apps/web`'s 3000, and both
allowlists above name the port.

### `develop` vs `master` — staging vs prod, one chain

Both branches settle on **Gnosis** (chain 100). `develop` is staging; `master`
is prod. The codebase is shared. The two Wrangler files are the only files that
must differ, because Pages resolves one config per root directory and that
file's `name` binds it to one project:

|                            | `master` (prod)             | `develop` (staging)                |
| -------------------------- | --------------------------- | ---------------------------------- |
| `wrangler.toml`            | `clc-app`                   | `clc-app-gnosis`                   |
| `apps/admin/wrangler.toml` | `clc-admin`                 | `clc-admin-gnosis`                 |
| Web host                   | `app.cosmolocal.credit`     | `test.cosmolocal.credit`           |
| Admin host                 | `admin.cosmolocal.credit`   | `admin.test.cosmolocal.credit`     |
| API                        | `api.cosmolocal.credit`     | `gnosis-staging.cosmolocal.credit` |
| Storage                    | `storage.cosmolocal.credit` | `gnosis-storage.cosmolocal.credit` |
| `VITE_BRAND`               | `prod` (green)              | `staging` (red)                    |
| `VITE_FULL_REACT_ERRORS`   | `false`                     | `true`                             |
| Relying party              | `cosmolocal.credit`         | `test.cosmolocal.credit`           |

**The two copies of each Wrangler file differ only in `name` and in their
"Per environment" blocks.** Every other line, comments included, is identical
on both branches, so a develop → master merge that touches a shared line (a new
shared variable, a comment) leaves master's values alone without a conflict.
Keep it that way:

- A new variable that is the same everywhere goes in the "Shared" block, on
  develop only. It reaches master with the next promote.
- A variable whose value differs goes in the "Per environment" block, committed
  on **both** branches with each branch's own value. Committing it on develop
  alone makes the next promote conflict — or, worse, take develop's value.
- Never resolve a Wrangler conflict by merging `master` into `develop` (GitHub's
  "Resolve conflicts" button does exactly that). It records master as the new
  merge base, and the next promote then silently carries staging's `name` and
  URLs onto master. Resolve on the master side, keeping master's lines.

`VITE_BRAND` selects the primary colour at build time (`data-brand` on `<html>`).
Green is the product brand (prod); red marks staging.

#### The brand reaches past CSS — icons, manifest, status bar

`data-brand` only recolours what the stylesheet draws. Everything the OS renders
outside the page — home-screen icon, install splash, task switcher, Android
status bar, browser tab — names a colour in sRGB and has to be selected by the
build. The palette is one table, `BRAND_PRIMARY_COLOR` in
`@clc/core/lib/constants/brand`, resolved by each app's `#/lib/brand` through
`resolveBrand`. Nothing else may hardcode `#007a55` or `#e7000b`, and unset
`VITE_BRAND` is prod: a misconfigured production deploy must not look like
staging.

**Both brands' assets ship; the build picks one by path.** `develop` and
`master` must keep identical trees outside the two Wrangler files, so nothing is
swapped or patched at build time:

| Surface         | Prod                            | Staging                            |
| --------------- | ------------------------------- | ---------------------------------- |
| Manifest        | `manifest.prod.webmanifest`     | `manifest.staging.webmanifest`     |
| Web icons       | `public/brand/prod/`            | `public/brand/staging/`            |
| Admin icons     | `apps/admin/public/brand/prod/` | `apps/admin/public/brand/staging/` |
| Install name    | `CLC`                           | `CLC Staging`                      |
| Admin tab title | `CLC Admin`                     | `CLC Admin (staging)`              |

Each web set is one SVG plus four rasters derived from it, and they are not
interchangeable: `logo.svg` / `icon-192` / `icon-512` are the rounded tile with
transparent corners (`purpose: "any"`); `maskable-512` is full-bleed and opaque
with the mark pulled into the central 80% safe zone (`purpose: "maskable"`, so a
launcher can crop it); `apple-touch-icon` is full-bleed, opaque and 180px
because iOS ignores the manifest, applies its own squircle, and composites
transparency on black. Regenerate the rasters from the SVG with
`magick -background none logo.svg -resize NxN out.png` after any change to the
mark. `apps/admin` uses the square tile (`rx="0"`) and needs only `logo.svg` and
`favicon.ico`.

**Do not patch `public/` after the build.** The previous mechanism rewrote
`manifest.json`'s `theme_color` in a `closeBundle` hook; Nitro copies `public/`
into the output later, so the file was still green in a staging build while
the `<head>` meta was correct. `apps/web/src/lib/-brand.test.ts` pins the
manifests to the palette so that cannot come back.

`theme-color` is a single meta that the pre-paint bootstrap in `theme.ts`
rewrites to the dark variant when that scheme is active — do not split it into
`media`-scoped copies, which would follow the OS rather than the stored choice.

Which chain a build settles on is `VITE_CHAIN_ID`, resolved once per app in
`#/lib/chain` and validated at boot. The chain's name, gas symbol, explorer and
Calibur implementation come from the table in
`@clc/core/lib/constants/chains`; per-chain token addresses (pool oracle base
currencies, Pretium ramp) sit beside the feature that reads them. Nothing else
may read `VITE_CHAIN_ID` except the build identity in `tooling/build-info.ts`,
which stamps the chain into each build; both go through `resolveChainId` in
`@clc/core/lib/constants/chains`. No new `?? "42220"` — a module that defaults
on its own is how the wagmi config ended up signing against Celo while the SIWE
request claimed another chain. Unset now means `100`.

Staging backend (`~/gnosis` on the `clc-gnosis` host):
`https://gnosis-staging.cosmolocal.credit` (clc-core) and
`https://gnosis-storage.cosmolocal.credit` (uploads). Prod is
`https://api.cosmolocal.credit` and `https://storage.cosmolocal.credit`. Each
frontend origin must appear in the matching box's `CORE_API__CORS`,
`CORE_RELAYER__ALLOWED_ORIGINS` and `STORAGE_API__ORIGIN`.

**The two storage hosts are separate buckets, and that is the point.** They were
one until prod moved to `storage.cosmolocal.credit`: staging QA uploads landed in
the same folders as real user images, distinguished only by object key, and
nothing in the client tags an environment.

A stored image URL is absolute. `optionalStoredImageUrlSchema` requires
`http(s)://`, storage-server returns the full URL and clc-core persists it, and
`VITE_STORAGE_URL` is read in exactly one place per app — to build the upload
client. Nothing joins it to a key at render time. So moving the endpoint moves
_new_ uploads only: every image uploaded before the move still points at
`gnosis-storage.cosmolocal.credit` and keeps resolving from there. That host has
to stay up for prod, or its objects have to be copied to the new one and the
stored URLs rewritten in clc-core.

`VITE_FULL_REACT_ERRORS` is a staging tool. It sets `minify: false` and
`NODE_ENV=development` for the client build, so a prod deploy with it on ships an
unminified bundle running development React. It is `true` on `develop` and must
stay `false` on `master`.

### Deployment — four Cloudflare Pages projects

|              | Branch    | Project            | Config                     | Host                           |
| ------------ | --------- | ------------------ | -------------------------- | ------------------------------ |
| `apps/web`   | `master`  | `clc-app`          | `wrangler.toml` (root)     | `app.cosmolocal.credit`        |
| `apps/admin` | `master`  | `clc-admin`        | `apps/admin/wrangler.toml` | `admin.cosmolocal.credit`      |
| `apps/web`   | `develop` | `clc-app-gnosis`   | `wrangler.toml` (root)     | `test.cosmolocal.credit`       |
| `apps/admin` | `develop` | `clc-admin-gnosis` | `apps/admin/wrangler.toml` | `admin.test.cosmolocal.credit` |

Both pairs deploy from Git. The dashboard build settings are **not** symmetric,
and the asymmetry is load-bearing:

| Project                          | Root directory | Build command                  | Output dir      |
| -------------------------------- | -------------- | ------------------------------ | --------------- |
| `clc-app` / `clc-app-gnosis`     | _(repo root)_  | `pnpm --filter @clc/web build` | `apps/web/dist` |
| `clc-admin` / `clc-admin-gnosis` | `apps/admin`   | `pnpm build`                   | `dist`          |

Production branch: `master` on `clc-app` / `clc-admin`, `develop` on
`clc-app-gnosis` / `clc-admin-gnosis`.

**Admin's root directory must be `apps/admin`.** Two different things read a
Wrangler config and they resolve it from different places:

- **Nitro**, at build time, from the build's working directory.
- **The Pages platform**, from the project's configured root directory — and that
  is the one that decides the asset output directory and the build environment
  variables.

With admin's root directory left at the repo root, the platform reads the _root_
`wrangler.toml`, takes `pages_build_output_dir: apps/web/dist` and web's eleven
vars, then fails the deploy after a successful build:
`Error: Output directory "apps/web/dist" not found.` Pointing the root directory at
`apps/admin` makes the platform read `apps/admin/wrangler.toml`, whose
`pages_build_output_dir = "dist"` resolves relative to it.

`pnpm install` still resolves the whole workspace from that subdirectory — pnpm
walks up to `pnpm-workspace.yaml` — so the monorepo install is unaffected.

No `NITRO_PRESET` is needed. Nitro maps Cloudflare's `CF_PAGES` variable to the
`cloudflare-pages` preset on its own, which is why the same `build` script emits
`dist/` on Pages and `.output/` locally. `pnpm build:cf` / `build:cf:admin` set the
preset explicitly and exist only to reproduce the Pages artifact on a laptop —
pair either with `wrangler pages dev apps/<app>/dist`.

**Every variable lives in the Wrangler file, not the dashboard.** While a Wrangler
config is present it is the source of truth: Pages surfaces its `vars` in the
dashboard read-only, and supplies them to the build as well as to the Function, so
`VITE_` values are inlined into the client bundle from there. Admin declares the
variables it reads (`VITE_API_URL`, `VITE_BRAND`, `VITE_CHAIN_ID`,
`VITE_RELAYER_URL`, `VITE_RELYING_PARTY_ID`, `VITE_STORAGE_URL`,
`VITE_MAPTILER_KEY`).

A local build is the exception and can mislead: nothing injects `[vars]` outside
Cloudflare's build system, so `vp build` / `build:cf` on a laptop reads `.env`
instead. A value present in `[vars]` and absent from `.env` will be missing from a
locally built bundle while being correct in production.

Nitro also _generates_ a config from whichever file it resolved, at
`dist/_worker.js/wrangler.json`, pointing `.wrangler/deploy/config.json` at it; the
checked-in file only seeds it. Hence the build-time warning that
`pages_build_output_dir` "is overridden and will be ignored".

**`apps/admin/wrangler.toml` is load-bearing, not boilerplate.** Deleting it makes
Nitro's resolution walk up to the root config, and the admin build then generates a
worker named after the web project carrying every one of `apps/web`'s vars,
MapTiler key included. Verified by building both ways.

The division of labour, from Cloudflare's own rule that a Wrangler file "serves as
the source of truth for Pages Functions projects":

| Concern                                          | Owned by        |
| ------------------------------------------------ | --------------- |
| Build command, output directory, root directory  | Pages dashboard |
| Project name, compatibility date/flags, bindings | `wrangler.toml` |
| Every `VITE_*` value, per environment            | `wrangler.toml` |

The dashboard keeps only the three build settings. Everything else is in the file
and read-only in the UI while the file exists.

### Keeping `*.pages.dev` branch previews working

Each project's Wrangler file carries an `[env.preview.vars]` block. Pages supports
exactly two environment overrides, `production` and `preview`, and only the relying
party differs between them:

| Project            | `[vars]` (production)    | `[env.preview.vars]`         |
| ------------------ | ------------------------ | ---------------------------- |
| `clc-app`          | `cosmolocal.credit`      | `clc-app.pages.dev`          |
| `clc-admin`        | `cosmolocal.credit`      | `clc-admin.pages.dev`        |
| `clc-app-gnosis`   | `test.cosmolocal.credit` | `clc-app-gnosis.pages.dev`   |
| `clc-admin-gnosis` | `test.cosmolocal.credit` | `clc-admin-gnosis.pages.dev` |

The preview value is the project's own `pages.dev` host on purpose, and it is why
web's was set that way to begin with: `resolveRelyingPartyId` honours a configured
value when it is a suffix of the serving host, so every `<branch>.clc-app.pages.dev`
shares one relying party and one passkey works across branches. Setting preview to
`cosmolocal.credit` would break that — no preview host is beneath it, so each branch
would fall back to its own hostname and register its own credentials.

**`vars` is non-inheritable**, so an `[env.preview.vars]` block must restate _every_
variable, not only the one that differs. Overriding it while omitting the rest fails
validation at deploy time. That is why the two blocks in each file are near-duplicates
— resist tidying them into a shared base.

Both preview origins must also be in clc-core's allowlists. `util.OriginAllowed`
supports a single `*` matching exactly one DNS label, so branch previews are one
entry each:

```toml
api.cors                += "https://clc-admin.pages.dev", "https://*.clc-admin.pages.dev"
relayer.allowed_origins += "https://clc-admin.pages.dev", "https://*.clc-admin.pages.dev"
```

Separate projects, not one project with two paths: a Pages project has a single
build output, and serving the console under the app's origin would place it inside
the scope of `apps/web`'s service worker.

**Two things are load-bearing across both hosts:**

1. **The session cookie's `SameSite` differs between local and deployed.**
   `authCookieSameSite` returns `None` when clc-core runs with `prod` set and `Lax`
   otherwise, so:
   - **Deployed**, `None; Secure` means any origin works, including a different
     registrable domain and `*.pages.dev` previews. That is deliberate — the
     comment in `internal/api/auth.go` names previews as the reason.
   - **Locally**, `Lax` means the browser and the API must share a registrable
     domain. Browsing `localhost:3000` against `VITE_API_URL=http://192.168.1.14:5003`
     is cross-site, so `/auth/signin` returns 200 and `/auth/session` then answers
     204 — sign-in succeeds and the cookie is silently dropped. Use the LAN host for
     both, or point `VITE_API_URL` at `localhost`.

   One deployed caveat: a `None` cookie sent from a _different_ registrable domain is
   a third-party cookie, so it depends on the browser still permitting those. The
   cookie sets no `Partitioned` attribute, so there is no CHIPS fallback. Keeping the
   console under `cosmolocal.credit` sidesteps this entirely — it stays first-party —
   while `*.pages.dev` previews are inherently third-party and may need `Partitioned`
   added if a browser tightens.

2. **`VITE_RELYING_PARTY_ID` must be the same on web and admin of one
   environment** for one passkey to work on either host — `cosmolocal.credit` on
   prod, `test.cosmolocal.credit` on staging. Do not share an RP across prod and
   staging: they are different credential stores.

   The value is normalized with `new URL(value).hostname`, so a scheme is stripped:
   `https://cosmolocal.credit` and `cosmolocal.credit` are equivalent. It is honoured
   only when it is a suffix of the serving host, so a value like
   `https://clc-app.pages.dev` has no effect on `app.cosmolocal.credit` — that host
   falls back to itself, and preview deploys keep their own relying party.

   Enforcement is the **browser's**, not the backend's: `relayer.relying_party_id` in
   clc-core is loaded into the relayer and never read, and the assertion check
   verifies the P-256 signature and `clientDataJSON.origin` against
   `relayer.allowed_origins` — it never hashes an RP ID. Keep the two consistent
   anyway, but the setting that must include a new console origin is
   `allowed_origins`, with the scheme (`https://admin.cosmolocal.credit`).

   Changing the RP ID invalidates existing passkeys: WebAuthn credentials cannot be
   re-scoped, so anyone registered under the old relying party must enrol again.
   Paper wallets are unaffected.

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
`packages/i18n/src/catalogs/{ar,de,dz,en,es,fil,fr,hi,it,nl,nl-BE,pt,sr,sw,uk,zh,zh-Hant}/messages.po`. They are compiled in-memory by
`@lingui/vite-plugin` (wired into dev, build, and `vitest.config.ts`) — there is
**no `lingui compile` step** and the generated `messages.ts` files are gitignored
(do not import or commit them).

**Hard rule — after adding or changing any `<Trans>` / `t` string you MUST run
`pnpm i18n:extract`** (from the repo root) and commit the updated `.po` files.
Skipping this leaves the new keys out of the catalogs: English silently falls
back to the source text, but every other locale (e.g. `sw`) is left untranslated.
Then fill in the new `msgstr ""` entries in each non-English catalog. This was
the `7f5ba80` regression fix — keep it intact.

Arabic uses the `ar` catalog with `ar-u-nu-arab` for Intl formatting. The web
app sets `dir="rtl"` only after that catalog activates successfully and restores
`dir="ltr"` for every other locale. Use logical inline-direction utilities
(`start`/`end`, `ms`/`me`, `ps`/`pe`, `border-s`/`border-e`) for web layout;
physical left/right is reserved for geometry that must not mirror. Addresses,
hashes, token symbols, URLs, phone numbers, and editable canonical amounts stay
`dir="ltr"` and isolated. User-authored descriptions, notes, and Markdown use
`dir="auto"`. Arabic human-facing numbers use Arabic-Indic digits, while URL,
query, contract, and input values remain canonical ASCII.

Dzongkha uses the `dz` catalog, stays `ltr`, and uses its CLDR-native Tibetan
digits for localized display numbers. Its CLDR plural rule has only the `other`
category. Editable amounts and machine-readable values remain canonical ASCII.
The existing font stacks rely on platform Tibetan-script fallback; do not add a
font dependency solely for Dzongkha.

Ukrainian uses the `uk` catalog, stays `ltr`, and uses `uk` Intl formatting with
a decimal comma and non-breaking-space grouping. Its CLDR plural categories are
`one`, `few`, `many`, and `other`. Editable amounts and machine-readable values
remain canonical ASCII.

German uses the `de` catalog, stays `ltr`, and uses `de` Intl formatting with a
decimal comma and period grouping. Its CLDR plural categories are `one` and
`other`. Product terminology uses **Fonds**, **Gutschein**, and **Geldbörse**;
editable amounts and machine-readable values remain canonical ASCII.

Filipino uses the canonical `fil` catalog, stays `ltr`, and uses `fil-PH` Intl
formatting with Latin digits and comma grouping. Legacy Tagalog browser tags
(`tl` and its regional or script variants) resolve to `fil`; only `fil` is
persisted. Its CLDR plural categories are `one` and `other`, with the category
depending on the final integer or fractional digit rather than English rules.
Product terminology intentionally keeps familiar loanwords such as **pool**,
**voucher**, and **wallet**. Editable amounts and machine-readable values remain
canonical ASCII.

Dutch uses the `nl` catalog, stays `ltr`, and uses `nl` Intl formatting with a
decimal comma and period grouping. Its CLDR plural categories are `one` and
`other`. Product terminology uses **fonds**, **waardebon**, and **portemonnee**;
editable amounts and machine-readable values remain canonical ASCII.

Flemish uses the separate `nl-BE` catalog for Belgian Dutch browser preferences,
stays `ltr`, and uses `nl-BE` Intl formatting with a decimal comma and period
grouping. Its CLDR plural categories are `one` and `other`. Product terminology
uses **fonds**, **waardebon**, and **portefeuille**; generic Dutch and non-Belgian
regional tags continue to resolve to `nl`. Editable amounts and machine-readable
values remain canonical ASCII.

Hindi uses the `hi` catalog, stays `ltr`, and uses `hi` Intl formatting with
Latin digits and Indian grouping. Its CLDR plural categories are `one` and
`other`, with zero and one selecting `one`. Product terminology uses **पूल**,
**वाउचर**, and **वॉलेट**; editable amounts and machine-readable values remain
canonical ASCII.

Simplified Chinese uses the `zh` catalog, stays `ltr`, and uses `zh-CN` Intl
formatting with Latin digits and comma grouping. Its CLDR plural rule has only
the `other` category. Product terminology uses **资金池**, **代金券**, and
**钱包**; editable amounts and machine-readable values remain canonical ASCII.
The existing font stacks rely on platform CJK fallback; do not add a font
dependency solely for Chinese.

Traditional Chinese uses the `zh-Hant` catalog for explicit Hant script tags
and the `zh-TW`, `zh-HK`, and `zh-MO` regions. It stays `ltr`, uses `zh-Hant`
Intl formatting with Latin digits and comma grouping, and has only the `other`
CLDR plural category. Product terminology uses **資金池**, **代金券**, and
**錢包**. Explicit `Hans`/`Hant` script tags take precedence over their region;
bare `zh` remains Simplified Chinese.

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

### NFC wallet cards

An NFC card is another carrier of the paper-wallet credential: one NDEF URL
record holding the same `?w=` link a printed QR does. `apps/web` reads cards
(sign-in, card collection); `apps/admin` writes them (the batch writer).

- **Split:** everything that decides what a tag means — record decoding,
  `classifyNfcError`, the reader lifecycle, the collect-intent rules and the
  writer state machine — is pure and lives in `@clc/core/features/nfc/*`. Each
  app has its own `NDEFReader` adapter under `#/lib/nfc/`, constructor injected
  so tests pass a fake rather than patching `window`. No shared NFC package.
- **Visibility is the capability check alone** (`useWebNfcSupported`). No
  feature flag; QR stays available everywhere.
- **A card's URL is data.** Decode the `?w=` payload; never navigate to it.
- **Collection keeps the collector's identity.** The payer's key is a transient
  signer held only in `useCollectPayerKey` — no `persist`, no `devtools`, never
  selected into a component, never `storePrivateKey`, never connected to wagmi.
  It is cleared on sign-out, route exit and "Done with this customer". Every
  charge consumes one explicitly armed intent; the card's absence is not a
  guard, the armed-intent rule and the same-wallet latch are.
- **Collection depends on an idempotent relay.** A lost relay response is
  reconciled by resending the identical signed request under its
  `operationId`, never by signing again. The collect page stays disarmed until
  `/relayer/health` reports `idempotentRelay: true` (clc-core migration
  `047_relay_operations`).
- Signing as an explicit account goes through `signCaliburBatchWithAccount`;
  the connected send path keeps choosing its own signer through the connector.

### Serwist (PWA)

`apps/web` only. Custom Vite plugin at `apps/web/plugins/serwist.ts`, worker
source at `apps/web/src/sw.ts`. Don't import serwist under `packages/core/`,
`packages/api/`, or `apps/admin/` — the admin console must never register a
service worker.

The production worker is built from a Nitro module on `prerender:routes`, the one
hook after Nitro copies `public/` into the output and before it builds the
server — not from a Vite `closeBundle`, which fires per environment and before
that copy, nor from `compiled`, after which the Node preset's server has already
indexed its static files and would 404 `/sw.js`. The nested `build()` sets
`publicDir: false`; copying `public/` into the output would overwrite files Nitro
generates there.

### Build identity and the update banner

Each build of either app carries `__CLC_BUILD_INFO__` (schema in
`@clc/core/features/app-updates/logic`, resolved by `tooling/build-info.ts`) and
publishes it uncached at `/build-info.json`. Both apps poll that file and offer a
reload when its `buildId` differs; a reload is the whole update.

- `buildId` digests the build's inputs (git tree IDs, lockfile, release entry,
  `VITE_` values), not its commit, so unrelated commits do not nag users. A Pages
  build fails if it cannot identify itself — a dirty or uncommitted input, or no
  git.
- `release.json` holds each app's `version`, `buildNumber` and `minimumBuild`.
  Bump `buildNumber` only when a release must be selectable as a minimum; set
  `minimumBuild` to make older builds' banner persistent. CI rejects a
  `buildNumber` that goes down.
- A reload is enough only because `sw.ts` precaches hashed assets and never
  serves documents. Adding document or runtime caching means revisiting the
  updater. Keep `skipWaiting: true` / `clientsClaim: true`.
- Web reloads only through `#/lib/page-reload`, which stale-chunk recovery shares.
  Reload-unsafe flows are hidden by route ID in `app-update-banner.tsx`; async work
  outside those routes should be a mutation so `useIsMutating` holds the reload.
- `/build-info.json` is an ordinary Nitro public asset with a `no-store` route
  rule, which generates its Pages `_headers` entry too. Anything added to the
  static output must exist before Nitro builds the server, or the Node preset
  never serves it. `/sw.js` and `/build-info.json` are also explicit
  `cloudflare.pages.routes.exclude` entries, so the preset's 100-rule cap cannot
  drop them and leave the SSR Function answering with HTML.
- Admin hides the update action on screens whose work lives outside mutations
  (paper wallets, pool/voucher publish, the post editor); keep that list in
  `apps/admin/src/features/app-updates/app-update-banner.tsx` current.
- Shared build tooling lives in `tooling/` (root `/scripts` is ignored). It
  reaches core by relative path, never `@clc/core`: the Vite config bundler hands
  workspace packages to Node to load as raw TypeScript, which fails on the Node
  that admin's Pages project builds with (its root directory is `apps/admin`, so
  the root `.node-version` does not apply). Keep Vite configs off `@clc/core`
  imports for the same reason; type-only imports are fine.

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
