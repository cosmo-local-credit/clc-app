# Admin Console Architecture Plan

- Status: Proposed
- Date: 2026-08-11
- Graduates to `docs/decisions/` as a numbered ADR once accepted.

This is a plan, not an accepted decision record and not a changelog. Sections
marked **backend-gated** depend on the `clc-core` repository and cannot be
completed here.

## Objective

Make `apps/admin` a production-grade, desktop-first operations console while
maximizing reuse with `apps/web` without coupling their product domains.

The target architecture shares stable CLC concepts and backend resource access,
not screens, workflows, view models, route state, or cache policy. The web app
and admin console must remain independently deployable and independently
changeable.

## Architectural principles

1. **Share invariants, not use cases.** Pools, vouchers, accounts, normalized
   addresses, backend errors, cursor semantics, and query identity are shared.
   Mobile marketplace flows and admin operations are not.
2. **One owner per concern.** `@clc/core` owns pure domain rules; `@clc/api`
   owns backend transport and server-state query definitions; each app owns its
   routing, presentation, orchestration, and user-experience policy.
3. **Prefer deep modules.** A resource module should hide URL construction,
   response normalization, cursor handling, error mapping, and cache identity
   behind a small interface. Do not create pass-through wrappers around `fetch`
   or `useQuery`.
4. **Do not invent hypothetical seams.** Introduce an adapter only where the
   web and admin apps actually need different behavior, such as cache freshness,
   auth UX, or routing.
5. **Never present partial or unavailable data as complete.** This is a hard
   requirement for an operational console.

## Target dependency structure

```text
apps/web ---------------------> @clc/api ---------------------> @clc/core
    |                              |                               |
    | mobile routes and UI         | backend resource modules      | pure CLC rules
    | wallet/passkey workflows     | normalization and errors      | schemas and types
    | mobile cache policy          | canonical query keys          | formatting
    | PWA and vendor adapters      | query option factories        | no network or React
    |
    +---- must never import apps/admin

apps/admin -------------------> @clc/api ---------------------> @clc/core
    |                              |
    | desktop routes and UI        | same resource interfaces
    | operator workflows           | admin-only backend resources
    | admin cache policy           | no app-private imports
    | typed table URL state
    |
    +---- must never import apps/web
```

There should be no shared UI package. The apps intentionally have different
layout systems, interaction density, responsive rules, authentication UX, and
release lifecycles.

## Package responsibilities

### `@clc/core`

Keep only platform-agnostic domain modules:

- CLC entities and value types that are meaningful outside one app.
- Zod schemas for domain values and commands.
- Pure business rules and calculations.
- Amount, fee, address, voucher, and offering formatting.
- Chain configuration, ABIs, and pure viem helpers where appropriate.

Delete `packages/core/src/lib/api`. Network configuration and clients violate the
core package's intended interface, and this module is not merely a second path —
it is dead. `configureApi` is called by both `apps/web/src/router.tsx` and
`apps/admin/src/router.tsx`, but the `apiClient` it configures has no callers, so
both apps currently configure a client that never issues a request. The call
reads as API setup while doing nothing, which is worse than an unused export.

Do not move admin-only concepts into core merely to make them importable. An
operator table row, dashboard metric tile, chart series, permission banner, or
admin filter is not a universal CLC domain concept.

### `@clc/api`

Make this the only owner of backend resource access and shared server-state
identity. Each resource module should hide:

- Endpoint URL and query-string construction.
- Request credentials and headers.
- Abort-signal propagation.
- Backend envelope decoding.
- Defensive normalization.
- Backend error classification.
- Cursor and page metadata.
- Canonical query keys.
- Base finite and infinite query options.

Use explicit package exports rather than an unrestricted `./*` export. Callers
should import supported resource interfaces, not normalization internals.

**An `exports` map alone does not enforce this.** While each app's `tsconfig.json`
maps `@clc/api/*` to the package source, both `tsc` and the bundler resolve
through that wildcard and never consult `exports`, so the map is decorative — a
non-exported subpath still imports and still builds. Enforcement requires
_removing_ the `@clc/api/*` paths entry from the consuming apps so resolution
goes through the package's `exports` instead. With that done, `tsc` rejects an
unlisted subpath with TS2307, which surfaces in the editor and in `pnpm -r check`.

The bundler remains lenient about workspace source packages, so a violation fails
typecheck rather than the build. Typecheck is therefore the gate; keep it in CI.

`@clc/core` still uses the `./*` wildcard and is still mapped in tsconfig paths,
so it has no such boundary yet. Narrowing it is worthwhile but separate — core's
surface is pure functions and schemas, where an accidental import is far less
costly than reaching into transport internals.

A resource may use an internal directory, but should expose one deliberate
interface:

```text
packages/api/src/
  client/
    create-client.ts
    errors.ts
  features/
    pools/
      index.ts          # public interface
      client.ts         # implementation
      normalize.ts      # implementation
      queries.ts        # implementation
    vouchers/
    accounts/
    reports/
    offerings/
    admin/
      session/
      overview/
  query-keys.ts
```

Do not create a generic repository interface for unrelated resources. Pools,
vouchers, accounts, reports, and offerings have different invariants and should
remain separate deep modules.

### `apps/web`

Keep web-specific modules here:

- Mobile routes, typed search params, and navigation history behavior.
- Wallet, wagmi, ConnectKit, passkey, PWA, geolocation, and notification logic.
- Mobile-specific React Query freshness and polling policies.
- Infinite marketplace assembly, map viewport bootstrapping, and filters.
- Web view models and UI.

Web hooks may compose base query options from `@clc/api`, but must not redefine
resource URLs, normalization, error contracts, or canonical query keys.

### `apps/admin`

Keep admin-specific modules here:

- Operator authentication UX and authorization-aware navigation.
- Desktop route search schemas for filters, cursor, page size, and sorting.
- Admin freshness policy and intent prefetching.
- Table columns, charts, metric presentation, and admin view models.
- Derived presentation values that are not universal domain rules.

Do not copy server data into Zustand. Admin server state remains in TanStack
Query, URL-visible table state remains in TanStack Router, and Zustand remains
limited to cross-route client state such as the theme.

## Backend client configuration

Replace module-level `import.meta.env` reads and the legacy core singleton with
one configured client instance, owned by each app:

```ts
// apps/<app>/src/lib/api.ts — one immutable instance per app
export const clcApi = createClcApi({
  baseUrl: import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? DEV_FALLBACK : ""),
});

// at a call site — plain per-resource query factory, given a resource client
useQuery(poolQueryOptions(clcApi.pools, params));
```

**Do not pass `fetch: globalThis.fetch` here.** It reads as harmless explicitness
but pins the real implementation at import time, so every `vi.stubGlobal("fetch",
…)` in the suite is bypassed and tests issue real network calls — this was
observed as 151 failing tests hitting staging for real. The client resolves the
platform `fetch` per request when none is supplied. Inject one only when the
caller genuinely has a different implementation to supply, as tests do.

There is deliberately **no `createClcQueries(api)` registry**. A single object
spanning every resource becomes shallow plumbing and contradicts both "prefer
deep modules" and "do not invent hypothetical seams". `createClcApi` exposes one
client per resource; query options stay plain exported functions that accept the
resource client they need. This yields:

- One immutable, app-owned client instance.
- No mutable package-level global.
- No React context or provider plumbing.
- Straightforward test injection — pass a stub resource client, or a stub
  `fetch` to `createClcApi`.

A registry becomes justified only under multi-tenant or runtime multi-backend
requirements. Neither exists today.

The implementation should:

- Validate and normalize the base URL once at application startup.
- Reject a missing production URL instead of silently using localhost.
- Accept a `fetch` adapter so resource modules are testable without global
  mutation.
- Default browser requests to the correct credential policy, while allowing a
  public resource to explicitly omit credentials.
- Preserve `AbortSignal` on every read.
- Map HTTP, malformed JSON, backend-envelope, authentication, authorization,
  rate-limit, and network failures into the shared error taxonomy defined below.

Do not fetch authenticated admin data during SSR until there is an explicit
cookie-forwarding strategy compatible with the separate backend. Render the
shell on the server and start authenticated reads in the browser. Do not add a
TanStack Start server function or Nitro route to proxy around this constraint.

## Shared error taxonomy

Both apps must agree on this, so it is decided here rather than left to
implementation. There is already an implicit taxonomy in the codebase — the
backend's `E06` and `E17` codes are branched on in web's auth path — and this
makes it explicit.

```ts
type BackendErrorKind =
  | "network"
  | "protocol"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "validation"
  | "conflict"
  | "rate-limited"
  | "server"
  | "application";
```

`BackendApiError` retains: `kind`, `status`, `code`, `description`, an optional
`retryAfterMs`, and the original `cause`.

| Condition                         | `kind`                        |
| --------------------------------- | ----------------------------- |
| 401, or code `E06`                | `unauthenticated`             |
| 403                               | `forbidden`                   |
| 404                               | `not-found`                   |
| 400, 422                          | `validation`                  |
| 409, or code `E17`                | `conflict`                    |
| 429                               | `rate-limited`                |
| 5xx                               | `server`                      |
| Non-JSON body on a success status | `protocol`                    |
| Non-JSON body on an error status  | by that status                |
| Rejected `fetch`                  | `network`                     |
| Aborted request                   | not converted; rethrown as-is |
| 200 with `ok: false`              | by `code`, else `application` |
| Any other 4xx                     | `application`                 |

Two refinements to the raw "non-JSON → `protocol`" rule, both chosen so the retry
policy behaves correctly:

- A 502 serving an HTML gateway page is a **server** fault that happens to be
  unintelligible, and is worth retrying. Classifying it as `protocol` would make
  it permanent. So an unparseable body is classified by its status whenever that
  status is already an error; `protocol` is reserved for a _successful_ response
  that broke the contract, which no retry can fix.
- An `AbortError` is never converted to a `BackendApiError`. React Query cancels
  superseded queries routinely, and surfacing that as a backend failure would
  make every filter keystroke look like an outage.

An unmapped 4xx is `application` rather than `validation`, since `validation`
implies the caller can fix the payload, which a 405 or 418 does not.

**Retry policy.** Only `network` and `server` receive the normal automatic
retry. `rate-limited` must respect `Retry-After` via `retryAfterMs` rather than
replaying immediately. No other kind is retried automatically — retrying a
`validation` or `forbidden` failure only multiplies the error.

## Shared query architecture

### Share query identity and mechanics

Move canonical key builders into `@clc/api`. Normalize address casing and all
filter inputs before constructing a key.

```ts
clcKeys.pools.page(params);
clcKeys.pools.infinite(params);
clcKeys.pools.detail(address);
clcKeys.pools.vouchers(address, params);
```

Finite and infinite queries must use distinct keys because their cached data
shapes differ. Every parameter that can change the returned rows must appear in
the key, including cursor, direction, page size, filters, sort field, and sort
direction.

Provide base query option factories for:

- One resource by stable identity.
- One cursor page.
- An infinite cursor sequence with tested termination rules.
- Resource relationships such as pool vouchers and voucher offerings.
- Mutations and the exact invalidation keys they affect.

### Keep cache policy app-specific

Do not force one staleness policy across both apps. The same resource can have a
different operational meaning in each product:

- The mobile public catalog favors long freshness and bounded memory.
- The admin console favors shorter operational freshness and explicit refresh.
- Wallet and transaction status may poll briefly while visible.

Each app should layer its policy over the shared base options without changing
the key or query function. This preserves shareability while keeping the apps
independent.

Suggested initial admin policies:

| Data                        | Stale time | Refresh behavior                            |
| --------------------------- | ---------: | ------------------------------------------- |
| Admin session               | 30 seconds | Refresh on focus and after auth changes     |
| Overview aggregates         | 30 seconds | Manual refresh; refetch on focus            |
| Pool/voucher/operator lists | 60 seconds | Keep previous page while navigating         |
| Pool/voucher detail         |  2 minutes | Intent-prefetch from list rows              |
| Account transfers           | 10 seconds | Poll only while the detail route is visible |
| Static reference data       | 10 minutes | No focus refetch                            |

These values are starting points and should be tuned from observed usage, not
promoted into global `QueryClient` defaults.

## Admin authentication and authorization

**Resolved. No new backend session resource was needed.**

An earlier draft of this section called for `GET /api/v2/admin/session` plus
operator permission claims, and for a stub session guarded out of production
builds. Both were unnecessary: clc-core already authenticates the credentials
operators hold, and already records the privilege that matters.

Operators sign in with the same credentials as `apps/web` — a paper wallet
(SIWE over the private key) or a passkey — and the console is gated on
`role === "SUPERADMIN"`, which `requireSuperAdmin` already enforces on every
`/api/v2/admin` endpoint. `POST /auth/signin` and `POST /auth/webauthn/verify`
already returned the role; the only backend change was adding it to
`GET /auth/session` so the gate survives a page reload instead of being
re-derived by probing an admin endpoint for a 403.

Reusing the web app's credentials is not the same as reusing its
wallet-connected state as proof of privilege — the role comes from the backend's
own record of the account, on every session check.

Paper-wallet signing follows the web app's persistence model: after SIWE
succeeds, the admin console stores the raw private-key signer in `localStorage`
under `clc.admin.operator-key`, restores it after reloads, and removes it on
sign-out. Only the paper-wallet branch is persisted; passkey signing records stay
in memory and are rebuilt by their own authentication flow.

The console models these states distinctly, in
`apps/admin/src/features/auth/admin-session.ts`:

- Session loading.
- Authenticated superadmin.
- Unauthenticated — renders sign-in inline, wherever the operator landed.
- Authenticated but not a superadmin — offers sign-out, not another sign-in.
- Session check unavailable, which includes a backend that does not report the
  role at all. Treating a missing role as "not privileged" would deny a real
  superadmin and send them hunting a permission problem that does not exist.

The backend remains the security authority; the route gate is only a UX seam.

Two environment constraints belong to passkey sign-in specifically, both
enforced in clc-core rather than the client:

- The console's origin must appear in `relayer.allowed_origins`, which
  `internal/relayer/webauthn.go` checks against the assertion's
  `clientDataJSON.origin`.
- A credential is bound to the `relying_party_id` it was registered under, so
  the console must be served from that host. Paper-wallet sign-in has neither
  constraint — the SIWE handler validates only the signature, the claimed
  address and the nonce.

## Correct pagination, filtering, and sorting

Never use a hard-coded first page as an entire admin dataset.

List routes should validate typed search params for:

- Cursor and direction.
- Page size, restricted to supported values.
- Search term and filters.
- Sort field and direction.

The URL is the source of truth, so Back/Forward navigation restores the exact
table view. Use links or normal router navigation so user actions push history;
reserve replacement for normalization.

Fetch only the displayed page, normally 25 or 50 rows. Once a resource spans
more than one page, sorting and filtering belong in the backend request rather
than `DataTable`. Keep client sorting only for a documented, fully loaded page.

Use a common normalized page result:

```ts
type CursorPage<T> = {
  items: T[];
  pageInfo: {
    first: number | null;
    last: number | null;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  quality: {
    received: number;
    accepted: number;
    dropped: number;
  };
};
```

`quality.dropped` describes malformed rows in this page; it is never a total
resource count.

## Purpose-built overview data

Do not build dashboard totals and charts by downloading catalog pages. Add a
backend aggregate resource such as `GET /api/v2/admin/overview` that returns:

- Total pools, vouchers, accounts/operators, and reports.
- Voucher counts by kind.
- Pool counts by tag or another bounded chart series.
- Data-quality and indexing coverage metadata.
- The aggregation timestamp.

This endpoint must perform aggregation close to the data and return a bounded
payload. If the backend endpoint is not available, the UI must label page-based
figures as samples and must not call them totals.

The overview's initial load should require only:

1. The admin session request.
2. The overview aggregate request after authentication succeeds.

The derived operator directory should be replaced with a paginated backend
operator resource. Pool ownership is useful enrichment, but it is not a complete
user or operator directory.

## Data-state integrity

Every query-backed surface must distinguish:

- Pending with no data.
- Refreshing with previous data.
- Successful and empty.
- Successful with data.
- Failed with no data.
- Failed refresh with stale data still visible.
- Partial data or normalization loss.

Never implement `query.data?.items ?? []` without handling `query.isError` before
rendering an empty state. A dashboard metric must render unavailable rather than
zero when its request failed.

Where a detail screen has independent secondary resources, such as pool
vouchers or voucher offerings, render an error state inside that section without
discarding the successfully loaded parent resource.

## Performance plan

### Network and server state

- Use aggregate endpoints for metrics and charts.
- Use server-side cursor pagination, filtering, and sorting.
- Fetch 25–50 list rows, not hundreds or a complete catalog.
- Pass abort signals so superseded filters and route changes cancel work.
- Keep previous page data during cursor transitions.
- Prefetch a detail query on deliberate row intent and optionally prefetch the
  next page after the current page settles.
- Poll only resources whose product behavior requires it, only while visible,
  and never in the background by default.
- Invalidate narrow resource keys after mutations rather than clearing the
  entire cache.
- Bound `gcTime` for search/filter variants so a long operator session cannot
  accumulate every historical result set.

### Rendering and bundles

- Keep charts in the overview route chunk; Recharts must not enter the shell or
  list-route chunks. **Enforced** by `pnpm check:bundle:admin`
  (`apps/admin/scripts/check-bundle.mjs`), which also holds every chunk to a
  recorded gzip baseline with a 10% tolerance. Run it after a build; both failure
  modes are verified to fire.

  Note the chunk naming is misleading when reading build output by eye: the
  overview lives at `_shell/index.tsx`, so its chunk is emitted as `_shell-*` and
  looks like the layout. The layout is the _other_ `_shell-*` chunk. The check
  distinguishes them by content, not by name.

- Keep table column definitions at module scope when they do not depend on
  render state.
- Paginate before considering row virtualization. Virtualization is warranted
  only for genuinely large, intentionally loaded datasets.
- Avoid broad icon-library imports.
- Treat `knip` output as investigation input, not an automatic deletion list.
  Review each reported primitive and dependency, then remove what is genuinely
  unreferenced. Some primitives are reached indirectly — `sidebar` imports
  `sheet` for its mobile drawer, so `sheet` looks unused and is not. Deleting on
  a report alone breaks the shell.

  Done once already: nine genuinely unreferenced primitives and three unused
  devtools dependencies were removed, `sheet` was correctly kept, and the
  remaining ~46 findings were _declined_ — they are re-exports of vendored shadcn
  primitives, kept at their full upstream API so component updates do not
  conflict. That decision is encoded in `knip.json` rather than re-litigated each
  run; unused _files_ in `components/ui` are still reported.

  A config that throws on load breaks knip, which reads `vite.config.ts` without
  building. Any future guard belongs in a build-only `buildStart` hook, not at
  config evaluation — the stub-auth guard that taught this lesson has since been
  deleted along with the stub itself.

- Preserve route-level code splitting through thin route files and feature page
  modules. Do not use inline dynamic imports.
- Avoid expensive chart or table derivations on every render. Prefer bounded
  backend aggregates, then memoize app-specific view models where necessary.

### Performance budgets

Record a baseline before enforcing bundle budgets, then fail CI on unexplained
regressions greater than 10 percent for the shell and each route chunk.

Initial runtime targets — all checkable in CI or a local run today:

- At most two backend requests for first useful overview data: session and
  aggregate overview.
- Overview aggregate response below 50 KB compressed.
- List responses below 100 KB compressed at the maximum supported page size.
- No full-catalog request from an admin route.
- No background polling after a route unmounts or the document becomes hidden.

**No field Core Web Vitals thresholds are set.** Not because LCP and INP are
irrelevant to an internal console — a slow or unresponsive operator tool is a
real cost — but because p75 targets require field telemetry that is not
collected. A threshold nobody can measure is ceremony, and it crowds out the
budgets above, which can actually fail a build. Revisit if operator telemetry is
ever introduced, or in response to a specific reported slowdown.

## `@clc/api` is a coupling point

The apps are independently deployable, but `@clc/api` is genuine compile-time
coupling between them. Naming it prevents "independently changeable" from being
mistaken for "isolated".

Policy:

> Every `@clc/api` change must update all affected web and admin consumers, and
> keep both apps' tests green, in the same commit.

Backward-compatible additive interfaces are **not** mandated. In a monorepo with
both consumers in-tree, an atomic breaking migration is usually cleaner than a
compatibility layer, and temporary aliases must not survive the change that
introduced them. The single-commit rule is what makes that safe: there is never
a state where one app compiles and the other does not.

## Enforcement

Extend lint restrictions so they enforce the architecture rather than merely
document it:

- Block `apps/admin` imports from `apps/web` and vice versa, including relative
  traversal patterns.
- Apply the sibling-feature UI import restriction to both apps.
- Block network clients and `import.meta.env` from `@clc/core`.
- Keep routing, UI, DOM, Serwist, and app-private aliases blocked in `@clc/api`.
- Keep Serwist and lingui out of admin.
- Keep admin-only resource imports out of web unless web gains a real product
  requirement for them.

Use explicit `@clc/api` exports so unsupported internal modules cannot become
accidental dependencies.

## Test strategy

Test through module interfaces rather than implementation details.

### `@clc/core`

- Domain invariants, calculations, parsing, and formatting.
- No network or React test harness.

### `@clc/api`

- Resource paths, request options, and abort propagation through an injected
  fetch adapter.
- Response normalization and malformed-row quality counts.
- Error taxonomy for HTTP and backend envelope failures.
- Canonical key stability, including address casing and filter order.
- Cursor next/previous behavior and infinite-query termination.
- Mutation invalidation contracts.

### `apps/admin`

- Auth boundary behavior for every session state.
- Refusal to authorize a session whose role is absent or not `SUPERADMIN`.
- Error versus empty versus stale-data rendering.
- Overview does not turn a failed resource into zero.
- Typed search-param normalization.
- Pagination, sorting, filtering, and Back navigation with memory history.
- Detail-section partial failures.
- Route-level bundle and request-count regression checks where practical.

### `apps/web`

- Existing mobile behavior remains unchanged while keys and base query options
  move into `@clc/api`.
- Infinite catalog assembly and memory policies remain app-owned.
- Query invalidation continues to reach every consumer after key migration.

## Migration: two parallel tracks

The work is not a single sequence. Roughly a third of it lives in the `clc-core`
repository and cannot be scheduled here. Presenting it as seven sequential phases
hides that dependency and would stall the plan at the first backend-gated step.

Track A proceeds now, in this repository, in order. Track B is backend-gated;
each item carries its dependency and its interim client behavior so Track A never
waits on it.

### Track A — client repo, unblocked

**A1. Make the console honest, and un-shippable by accident.** Highest priority;
the current overview renders `0` for a failed request, which is
indistinguishable from a healthy empty backend.

1. Add explicit error states to every query-backed surface, including each
   independent detail section.
2. Label page-derived figures as samples per the interim contract below.
3. Add regression tests for error, partial, stale, and empty states, and for the
   auth gate in every session state.

**A2. Establish one backend client owner.**

1. Add `createClcApi` with validated configuration and injected `fetch`.
2. Delete `packages/core/src/lib/api` — it is dead code. `configureApi` is
   called by both routers, but the `apiClient` it configures has no callers, so
   both apps currently configure a client that never issues a request.
3. Remove both apps' calls to the legacy `configureApi`.
4. Reject a missing production base URL instead of defaulting to localhost.
5. Implement the shared error taxonomy.
6. Convert resource clients to the configured adapter.
7. Replace `@clc/api`'s `./*` export with explicit exports.

**A3. Unify shared query identity.**

1. Move canonical key builders and base options into each `@clc/api` resource
   module.
2. Add distinct finite and infinite factories.
3. Migrate web hooks without changing their app-specific freshness behavior.
4. Migrate admin queries and invalidation to the same keys.
5. Delete duplicate app-local resource keys and query functions.

**A4. URL-addressable list state.** The parts needing no backend change:

1. Define typed search schemas per list route.
2. Implement cursor navigation and page metadata against existing cursor
   endpoints.
3. Restrict client sorting to a fully loaded page, labelled as such.
4. Add navigation-history regression tests with memory history.

**A5. Performance and cleanup.**

1. Verify route chunks; keep chart code out of the shell and list chunks.
2. Review `knip` output and remove what is genuinely unreferenced.
3. Tune freshness and garbage collection from observed operator behavior.
4. Record a baseline, then enforce the request, payload, and bundle budgets.
5. Run `vp check`, `vp test`, `vp run knip:cycles`, and
   `vp run knip:production`.

### Track B — backend-gated

Each item needs an owner in `clc-core` before it can be scheduled. Until then the
interim behavior in the next section applies.

**B0. Unblock local development. Done.** Two claims in the first draft of this
item were wrong, and checking `clc-core` rather than assuming is what corrected
them:

1. `http://localhost:3001` was **already** in `api.cors`. No change was needed
   for local development; confirm the staging allowlist separately, since it is
   configured per environment.
2. The development session was **already possible** — `/auth/signin` accepts the
   credentials operators already hold. What was actually missing was `role` on
   `GET /auth/session`, now added, plus `:3001` in `relayer.allowed_origins` for
   passkey sign-in.

**B1. Operator session and authorization. Done, without new backend surface.**
See "Admin authentication and authorization" above. `requireSuperAdmin` already
enforced per-endpoint authorization, and `/auth/logout` already covered logout;
production cookie and domain configuration remains an environment task.

**B2. Overview aggregates.** `GET /api/v2/admin/overview` with bounded payload
and coverage metadata. Unblocks real totals and charts. **Still outstanding.**

**B3. Paginated operator directory. Replaced; pagination outstanding.** A
directory endpoint **already existed** — `GET /api/v2/admin/users`, with an
optional `?status=` filter — so the earlier claim that none did was wrong. The
ownership-derived table is gone, along with `use-known-operators`, and the
Accounts surface now reads that endpoint with approve and reject wired up.

Two things remain, both in `clc-core`:

1. **Pagination.** `?perPage=1` returns every row. Until cursor parameters exist,
   the surface states a true total and offers no paging controls — the one figure
   in this console that is not a page sample. Adding cursors is much smaller than
   a new resource.
2. **`PUT /admin/users/:address/limits` is broken.** It answers 400 / `E02`
   "Invalid or malformed request" for a correct payload, including from curl.
   `adminUpdateUserLimitsHandler` calls `c.Bind` twice — once for the address
   param, once for the body — and the first call consumes the body, so the second
   fails. Approve and reject bind once and work. The client is written against the
   documented contract and needs no change once the handler is fixed; the note in
   `account-admin-panel.tsx` comes out at that point.

**B4. Server-side sorting and filtering parameters.** Unblocks moving sort and
filter out of the client once a resource spans more than one page. **Still
outstanding**, and it applies to the admin lists too, for the same reason as B3.

Do not run production builds automatically during normal edits; run the admin
build in CI or as an explicit release verification step.

## Interim behavior for backend-gated work

This is the contract that lets Track A proceed without making incomplete data
look authoritative. Each row applies until its Track B item lands.

| Missing backend capability | Required client behavior                                                |
| -------------------------- | ----------------------------------------------------------------------- |
| ~~Admin session~~          | Resolved — real superadmin session, no stub in any build                |
| Overview endpoint          | Label figures as a page sample; never call them totals                  |
| ~~Operator endpoint~~      | Resolved — `/api/v2/admin/users` exists; see B3 for its pagination gap  |
| Unpaginated admin list     | Show every row returned and say so; do not imply a page of a larger set |
| Server sorting             | Sort the current page only, labelled as such                            |
| Server filtering           | Do not expose filters that imply global results                         |
| Total or `hasNextPage`     | Show "N shown" with cursor controls; do not claim completeness          |

## Acceptance criteria

Split by track, because Track A must be able to reach "done" without waiting on
another repository.

### Track A complete

- `apps/web` and `apps/admin` never import each other.
- `@clc/core` contains no network client or environment lookup.
- `@clc/api` is the only backend transport owner, with explicit exports.
- A missing production base URL fails the build rather than defaulting to
  localhost.
- Every backend failure maps to a `BackendErrorKind`, and only `network` and
  `server` retry automatically.
- Shared resources use canonical keys and base query options from `@clc/api`.
- Each app can tune freshness and orchestration without editing the other app.
- Errors and partial coverage cannot render as valid zero or empty data.
- No figure derived from one cursor page is presented as a total.
- Console access requires a backend-reported `SUPERADMIN` role, and no stub
  session exists in any build.
- Admin list state is URL-addressable and Back/Forward safe.
- Admin routes do not download complete catalogs.
- Lint, tests, cycle checks, and the request/payload/bundle budgets pass.

### Fully complete — requires Track B

- ~~Every admin endpoint enforces backend authorization.~~ Already true via
  `requireSuperAdmin`.
- ~~No stub session exists in any build.~~ Done.
- First overview data uses no more than the session and aggregate requests.
- Admin totals come from aggregates, not samples, and no "sample" labelling
  remains.
- The operator directory reads `/api/v2/admin/users` rather than being derived
  from pool ownership, and that endpoint accepts cursor parameters.
- Sorting and filtering across multi-page resources happen server-side.

## Explicit non-goals

- No shared UI package between web and admin.
- No generic repository abstraction over unrelated backend resources.
- No query registry spanning every resource; per-resource query factories only.
- No mutable package-level client global, and no React context for the client.
- No serverless functions, Nitro routes, or client-repo backend proxy.
- No admin data copied into Zustand.
- No web wallet or PWA modules promoted into shared packages.
- No mandated backward-compatible additive interfaces in `@clc/api`; atomic
  breaking migrations are preferred, and no compatibility alias survives the
  change that introduced it.
- No field Core Web Vitals thresholds until operator telemetry exists.
- No speculative core types for concepts used by only one app.
