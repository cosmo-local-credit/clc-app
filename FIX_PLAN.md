# Fix plan: check gate and mobile API loading boundaries

## Outcome

Resolve the two actionable review findings without changing request or product
behaviour:

1. Make `vp check` clean by fixing one typecheck error and one lint warning.
2. Remove the aggregate shared API client from the mobile root graph, then make
   the resource boundary explicit throughout `apps/web`.

The work has two distinct payoffs:

- **Performance tranche:** the root currently reaches roughly 88 KB of
  unminified API client source just to call `auth.getSession()`. After the auth
  split, it should reach only the HTTP transport and auth client. The expected
  initial-load reduction is roughly 10–15 KB gzipped, pending measurement in an
  approved build.
- **Architecture tranche:** migrating the remaining consumers changes little
  about total shipped code because web uses 10 of the 11 resource clients. It
  preserves route-level loading, removes about 19.7 KB of admin client source
  from the web bundle entirely, and prevents future admin growth from entering
  the mobile graph.

The admin console may continue to use `createClcApi`; its desktop shell uses the
composed console surface.

## Scope and working-tree constraints

- This is not a tiny wiring edit. The current inventory is 37 existing web
  files importing or mocking `#/lib/api`: 24 runtime files and 13 tests. With
  the new resource modules, shared API changes, admin pool consumers, tests, and
  lint rule, the architectural tranche will touch roughly 50 files.
- The 13 tests that mock `#/lib/api` are part of the migration. Their mocks must
  move to the exact resource module imported by the subject under test; leaving
  them as follow-up work risks tests silently ceasing to intercept the client.
- Do not introduce `apps/web/src/lib/api/index.ts` or another barrel. Re-exporting
  module-scope client instances would recreate the eager graph while evading the
  aggregate-factory lint rule.
- A reviewer ran `vp check --fix`, which formatted three untracked admin voucher
  files. Those and all other in-progress admin UI changes are unrelated work:
  preserve them and do not stage them as part of this fix.
- Run `vp check` read-only during implementation. Do not use `vp check --fix`
  against a dirty tree; if formatting outside this plan becomes a gate again,
  report it separately instead of rewriting unrelated work.

## Out of scope

- Relying-party ID and passkey rollout decisions. The apps are not live yet, so
  this is an operational deployment concern rather than a release blocker here.
- The Nitro 4 lockfile update. Staying current is intentional unless it causes a
  demonstrated regression.
- Restoring relative pool pricing. The current mobile pools flow is unfinished
  and will be handled separately.
- Endpoint, query-key, cache-policy, or user-flow changes unrelated to the two
  findings above.

## 1. Fix the typecheck error and lint warning

Neither diagnostic is a failing test: the `packages/api` tests are green. Both
are static-check findings, and `vp check` is the gate that detects and confirms
them.

### Changes

- In `packages/api/src/features/deployments/queries.test.ts`, replace the invalid
  `"SWAP_POOL"` argument with `"POOL"`. The parameter type is
  `DeploymentContractType = "POOL" | "TOKEN"`; `DeploymentContract` is the
  result object and must not be named as the argument type in this change.
- In `packages/api/src/features/pools/client.test.ts`, narrow/assert that
  `init.body` is a string before passing it to `JSON.parse`. Do not coerce an
  arbitrary `BodyInit` using `String(init.body)`.

### Verification

- Run `vp check` and require a zero exit code with no diagnostics.
- Do not claim an affected test run proves these two fixes; tests do not exercise
  either static diagnostic.

## 2. Performance tranche: remove the aggregate client from root auth

This tranche captures the entire initial-load win without waiting for the
larger resource migration.

### A. Export the required shared entry point

- Add `./client/http-client` to `packages/api/package.json`, alongside
  `./client/create-clc-api`. There is no `@clc/api` root export.
- Keep the existing API URL fallback and late-bound `fetch` behaviour unchanged.
- Update the stale comment in `create-clc-api.ts` that says the raw transport is
  deliberately unavailable; the transport becoming a public subpath is
  intentional.

### B. Add only the root-auth modules

- Add `apps/web/src/lib/api/http.ts`, which creates the one app-local HTTP
  transport.
- Add `apps/web/src/lib/api/auth.ts`, which imports only `createAuthClient` and
  the shared HTTP transport and exports one module-scope auth client.
- Migrate `use-auth-status.ts` and `use-backend-auth.ts`, the two hooks reached
  by `routes/__root.tsx`, to the exact `#/lib/api/auth` module.
- Retarget their tests from `vi.mock("#/lib/api")` to
  `vi.mock("#/lib/api/auth")`, preserving assertions against the mocked auth
  methods.
- Leave the old aggregate module temporarily available to non-root consumers so
  this tranche can land independently.

### Implement-time proof

- Inspect `routes/__root.tsx`, `use-auth-status.ts`, and `use-backend-auth.ts`
  and their import closure. Within the shared API layer, root auth may reach the
  HTTP and auth modules only; it must not reach `createClcApi` or another
  resource client.
- Source inspection is the implement-time proof. `rg` for `createClcApi` alone
  is insufficient because a barrel or an incorrect root-hook import can recreate
  the eager graph without using the aggregate factory.

## 3. Architecture tranche: migrate the remaining web resources

### A. Export the remaining missing client

- Add `./features/vouchers/deploy-client` to the `@clc/api` export map. The web
  voucher deployment hook currently reaches this factory only through
  `createClcApi`.
- The pool deployment client already has a package subpath; do not add another.

### B. Configure resource-scoped clients

- Add exact resource modules under `apps/web/src/lib/api/` for the multi-use web
  resources: `accounts`, `deployments`, `market`, `offerings`, `pools`,
  `pretium`, and `reports`. Each module imports only its factory and the shared
  HTTP transport and exports one module-scope client.
- Keep `auth.ts` from the performance tranche as the auth resource module.
- `voucherDeploy` and `poolDeploy` each have one call site. Instantiate those
  clients at module scope in their consuming hooks, using the shared HTTP
  transport, as existing relayer consumers already do. Dedicated one-use wrapper
  modules would add indirection without creating a sharing boundary.
- Replace every remaining `clcApi.<resource>` use with an exact resource import.
- Delete `apps/web/src/lib/api.ts` only after no web consumer imports it.
- Do not re-export the resource modules from a barrel.

### C. Rewire all test mocks as part of the same change

- Update all 13 existing `vi.mock("#/lib/api")` sites to mock the exact module
  path imported by the code under test.
- Preserve the existing mock behaviour and call assertions; do not replace a
  behavioural mock with a render-only assertion.
- Run the affected web tests after each resource group is migrated so an exact
  module-path mistake is localized. An unmocked client must not be allowed to
  fall through to a live request.

## 4. Move superadmin pool operations behind the admin client

`createPoolsClient` returns its methods in one object literal, so bundlers cannot
drop its two admin-only properties while web uses public pool methods.

### Client changes

- Move `getAccountPools` and `updatePoolProfile` from `PoolsClient` to
  `AdminClient`.
- Reuse the exported `normalizeUserPool`, `UserPoolPage`, and
  `PoolProfileUpdate` types from the pools client. Keep `PoolProfileUpdate` in
  the pools module because it describes the pool catalog record, not a distinct
  admin DTO.
- Use type-only imports where only types are needed. Do not create a value import
  from the public pools graph back to `createAdminClient`.

### Query-factory decision

- Move `accountPoolsQueryOptions` from
  `packages/api/src/features/pools/queries.ts` to
  `packages/api/src/features/admin/queries.ts` and change it to accept an
  `AdminClient`.
- Keep `poolKeys.account` in the pools query-key family and use it from the moved
  factory so existing pool invalidation still reaches account membership rows.
- Update `apps/admin/src/features/users/ui/account-record-tabs.tsx` to import the
  factory from admin queries and call it with `clcApi.admin`.

### Consumer and test changes

- Change `apps/admin/src/features/pools/use-update-pool-profile.ts` to call
  `clcApi.admin.updatePoolProfile`.
- Move the `updatePoolProfile` client coverage from
  `packages/api/src/features/pools/client.test.ts` to the admin client tests and
  add/retain coverage for `getAccountPools` there.
- Change the mock in
  `apps/admin/src/features/pools/-edit-pool-profile-sheet.test.tsx` from
  `pools.updatePoolProfile` to `admin.updatePoolProfile`.
- Update any query-factory coverage for the moved account-pools factory while
  retaining the `poolKeys.account` key shape.

## 5. Enforce the boundary

- Add a web-only `no-restricted-imports` override beside the existing app
  boundary in `vite.config.ts`.
- Reject `@clc/api/client/create-clc-api` under `apps/web/src/**` with a message
  directing callers to exact `#/lib/api/<resource>` modules.
- Also reject `@clc/api/features/admin` and `@clc/api/features/admin/**` from
  `apps/web/src/**`. The mobile app has no valid admin endpoint consumer.
- Keep the aggregate factory available to `apps/admin`.

## Verification and acceptance criteria

### Static and behavioural checks

- `rg` finds no `createClcApi` import, `clcApi.<resource>` use, or import of the
  deleted `#/lib/api` module in `apps/web`.
- No `apps/web/src/lib/api/index.ts` or equivalent resource barrel exists.
- The two deploy hooks use their direct client subpaths and the shared transport.
- The 13 web test mocks target exact resource modules, and the affected tests
  exercise their mocked calls without making live requests.
- Admin pool consumers use `clcApi.admin`; public `PoolsClient` exposes no
  `/api/v2/admin` operation.
- `vp check` passes cleanly.
- `vp test` passes across the workspace after the API and test-mock refactor.

### Source and bundle checks

- During implementation, confirm from the source graph that the root auth hooks
  reach only auth plus transport and that the public pools graph has no admin
  client value import.
- Do not auto-run the full build. When a build is explicitly requested or runs
  in CI/release validation, compare initial JavaScript using the same build
  environment before and after the auth split.
- The expected initial transfer reduction is about 10–15 KB gzipped. If the
  measured reduction is below 10 KB, inspect the chunk graph and explain the
  difference before declaring the performance tranche complete.
- Confirm the built initial root/auth graph contains no admin, pools, market,
  reports, Pretium, or deployment client code.
- Confirm the built web pools chunk contains no `/api/v2/admin` endpoint strings.
- Expect only a modest total-bundle reduction: the primary result is moving
  non-auth resources off the critical path, with admin source removed entirely.

## Implementation order

1. Fix the typecheck error and lint warning; use `vp check` as the gate.
2. Export the HTTP transport and land the isolated auth module.
3. Migrate the two root-auth hooks and their mocks; prove the root source graph
   is clean. This completes the performance tranche.
4. Export voucher deploy, migrate the remaining resource consumers, and rewire
   all remaining exact-path mocks.
5. Remove the aggregate web module.
6. Move the admin-only pool methods, account-pools query factory, consumers, and
   tests behind `AdminClient`.
7. Add import guards, run `vp check` and `vp test`, and perform bundle validation
   only when a build is authorized.
