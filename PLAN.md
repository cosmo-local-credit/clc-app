# Auth + onboarding revamp plan

## Scope

Frontend-only revamp for `apps/web`. Backend changes are out of scope for this plan. Where the current backend cannot support a desired flow, the frontend must ship safe, non-crashing behavior and mark the backend dependency explicitly.

## Goal

Make the public market the default experience. Unauthenticated users can browse marketplaces on the map, shops, and offerings, but cannot perform wallet, voucher, pool, activity, settings, or transactional actions until they complete sign-up/sign-in.

The market page becomes the landing page. The old full-screen landing page is replaced by a compact onboarding/sign-in entry point on the public market surface.

## Backend facts the frontend must code against

- `GET /auth/session` exists and is public.
  - `204` means no valid session.
  - `200 { address, chainId }` means valid session.
  - Use this for session checks, not `getProfile()`.
- Session auth is via HttpOnly cookie `__clc_auth`; the client cannot read it.
- `POST /auth/signin` returns:
  - `200` on successful SIWE sign-in;
  - `404` when address is not registered;
  - `403` when user is pending/rejected.
- `POST /auth/signup` currently auto-approves new web signups.
- `POST /auth/siwe/verify` exists but auto-registers new addresses as pending. Do not adopt it in this frontend plan without a backend/product decision.
- Current backend SIWE verification supports EOA signatures only.
- The Calibur WebAuthn connector does not support arbitrary `personal_sign`; calling `signMessage` against it throws.
- Protected-route cookie failures surface as `BackendApiError` `status === 401` or code `E06`.

## Decisions before coding

1. **`isAuthenticated` means wallet connected + backend session verified.** A wagmi connection alone is not private-app auth.
2. **Use `/auth/session` for auth status.** Do not infer auth from `getAuthToken()` or `getProfile()`.
3. **Remove the dead sessionStorage token store.** `features/auth/state/token.ts` is not wired into request headers. Cookie state is authoritative.
4. **Shared sign-in UI goes under `apps/web/src/components/auth/`.** This avoids sibling feature UI imports from `features/home`.
5. **Show a skeleton during auth bootstrap/reconnect.** Do not flash guest market/banner while reconnect has not been attempted.
6. **Use wrapper guards for private routes.** Avoid TanStack route file moves in this iteration.
7. **Preserve private-route intent by not redirecting sign-in guards.** A guest on `/wallet/send` stays on that URL; after auth, the guarded content renders.
8. **Preserve sign-up intent with a validated redirect search param.** Sign-up leaves the route, so `/onboarding?redirect=/wallet/send` is required.
9. **Guest language/theme access remains visible.** Put `OnboardingMenu` or equivalent public controls in the market banner/chrome.
10. **Silent `?w=` guest imports become explicit.** QR/private-key URL import should open an explicit prompt, not silently sign in.
11. **Passkey sign-in cannot create a backend session yet.** The frontend must avoid crashes and show a session-unavailable state until backend support exists.

## Current state review

- `apps/web/src/routes/index.tsx`
  - Root gates the whole app on `useAccount().isConnected`.
  - Disconnected users only see `LandingPage`.
  - Connected users see `HomePage`.
  - Missing/invalid `tab` falls back to `wallet`.
- `apps/web/src/features/home/ui/home-page.tsx`
  - Default uncontrolled tab is `wallet`.
  - All five tabs always render: wallet, activity, market, pool, settings.
  - Sign-out clears the unused token store, calls backend logout, then disconnects wagmi.
- `apps/web/src/features/home/ui/bottom-navigation.tsx`
  - Always renders a five-column nav.
- `apps/web/src/features/home/ui/market-page.tsx`
  - Already has a map-first public surface.
  - Current controls are browse/location-only; no private action exists yet.
- `apps/web/src/features/onboarding/ui/landing-page.tsx`
  - Currently acts as unauthenticated root.
  - Contains sign-up CTA plus passkey recovery, paper-wallet sign-in, encrypted wallet unlock, and private-key sign-in.
- `apps/web/src/routes/wallet/**`
  - Direct routes are not protected.
- `apps/web/src/providers/web3.tsx`
  - Reconnect is deferred post-mount, so first client render can be `disconnected` before reconnect starts.

## Target UX model

### Guest

- `/` shows the public market map.
- Wallet, activity, pool, and settings tabs are hidden.
- Bottom nav uses a one-item/centered public layout.
- Compact onboarding banner is visible.
- Guests may browse map/shops/offerings and use location.
- Guests may change language/theme.
- Guests may not send, receive, swap, top up, redeem, join pools, create vouchers, access wallet pages, manage settings, or link notifications.

### Authenticated user

- `/` defaults to market.
- Full bottom nav is available.
- Onboarding banner is hidden.
- Private interactions are enabled.
- Sign-out returns to public market mode.

## Implementation plan

### 1. Add `/auth/session` client wrapper

Update `apps/web/src/features/auth/api/client.ts`:

```ts
export type SessionResult = { address: string; chainId: number };

export async function getSession(): Promise<SessionResult | null> {
  return apiFetch<SessionResult | null>("/auth/session", { method: "GET" });
}
```

`apiFetch` already returns `null` for empty `204` bodies and raw bodies for non-envelope responses.

### 2. Add auth bootstrap readiness

Create an app-local bootstrap flag, e.g. `apps/web/src/providers/auth-bootstrap.ts`.

- `reconnectAttempted` starts `false`.
- In `ReconnectOnMount`, flip it to `true` at the start of the reconnect effect, before/at `reconnect()`.
- `useAuthStatus` treats `!reconnectAttempted` as `loading`.
- SSR and first paint render the same skeleton, preventing hydration mismatch and guest-banner flash.

### 3. Add `useAuthStatus` state machine

Create `apps/web/src/features/auth/hooks/use-auth-status.ts`.

States:

- `loading`: reconnect not attempted, wagmi `connecting`/`reconnecting`, or session query pending while an address exists.
- `guest`: reconnect settled and no wallet is connected.
- `connectedNoSession`: wallet connected and `/auth/session` is `null`, or session address does not match connected wallet.
- `authenticated`: wallet connected and `/auth/session.address` matches connected wallet case-insensitively.
- `sessionCheckError`: `/auth/session` threw a non-401/non-expected error such as network/5xx.

Implementation notes:

- Query key: `['auth', 'session', address]`.
- Query enabled only when `reconnectAttempted && !!address`.
- Compare addresses case-insensitively.
- Expose `state`, `isLoading`, `isAuthenticated`, `needsBackendSignin`, `address`, `chainId`, `connectorId`, and retry/invalidation helpers if useful.
- Do not classify backend outages as guest/no-session. Show retry and avoid tearing down already-mounted private content on transient session-check errors.
- Approval status is not observable from `/auth/session`; it is handled from sign-in mutation errors.

### 4. Global 401 / `E06` handling

Wire this in `apps/web`, not `packages/core`.

- In `apps/web/src/router.tsx`, create/configure the QueryClient with app-local `QueryCache`/`MutationCache` error handlers, or wrap the existing `createQueryClient()` result if that is cleaner.
- On `BackendApiError` with `status === 401` or `code === 'E06'`:
  - invalidate `['auth', 'session']`;
  - let `useAuthStatus` recompute to `connectedNoSession`;
  - do not auto-disconnect wagmi.

This gives expired-cookie users a re-auth prompt instead of scattered query failures.

### 5. Remove dead token store

Remove `apps/web/src/features/auth/state/token.ts` and all uses.

- Remove `clearAuthToken()` from `HomePage` sign-out.
- Sign-out becomes:
  1. abort pending wallet switch;
  2. `backendLogout.mutateAsync()`;
  3. `disconnectAsync()`;
  4. invalidate `['auth', 'session']`.

### 6. Extract shared sign-in panel

Create `apps/web/src/components/auth/sign-in-panel.tsx`.

API:

```tsx
type SignInPanelProps = {
  onAuthenticated: () => void;
  onCancel?: () => void;
};
```

Rules:

- No hard-coded navigation to `/`.
- Private key / paper wallet:
  - call `useBackendPrivateKeySignin` first;
  - `200`: store key, connect `pkConnector`, then `onAuthenticated()`;
  - `404`: navigate to `/onboarding` with validated `redirect` if applicable;
  - `403`: show approval UI.
- Encrypted paper wallet:
  - decrypt, then use the same private-key path.
- Passkey / Calibur:
  - do not call `signMessage` or `useBackendWalletSignin` for `calibur-webauthn`;
  - connect/recover only if needed, then show `sessionUnavailable` because backend cannot issue a session for this connector yet;
  - offer paper-wallet/private-key alternatives.

Add helper:

```ts
function canSignSiwe(connectorId: string | undefined): boolean {
  return connectorId !== "calibur-webauthn";
}
```

Use this guard everywhere a SIWE signature would be requested.

### 7. Add re-auth affordance for connected wallets without session

In auth-required screens and sign-in sheets:

- If `useAuthStatus().state === 'connectedNoSession'` and `canSignSiwe(connectorId)`:
  - show “Re-authenticate”;
  - call `useBackendWalletSignin(address, chainId)`;
  - on success, invalidate `['auth', 'session']` and let the guard render private content.
- Apply the same error branches:
  - `404`: route to `/onboarding?redirect=...`;
  - `403`: approval UI;
  - network/5xx: retryable error.
- If connector is Calibur, hide re-auth and show `sessionUnavailable`.

### 8. Add approval / unavailable auth states

Create small flat mobile UI components under `apps/web/src/components/auth/`:

- `approvalPending`: “Your account is awaiting approval.” Include “Check again” that retries sign-in.
- `approvalRejected`: “This account can't be approved.” Include support/contact guidance.
- `sessionUnavailable`: passkey session is not available yet; offer paper-wallet/private-key alternatives.

Drive these from `BackendApiError` on sign-in mutation:

- `403` plus description/code decides pending vs rejected copy where possible.
- Calibur/passkey no-session path uses `sessionUnavailable`.

### 9. Make root route public but auth-ready

Update `apps/web/src/routes/index.tsx`:

- Always render home/market shell after auth readiness resolves.
- Stop rendering `LandingPage` directly at `/`.
- Default `tab` to `market`.
- While `useAuthStatus().isLoading`, render a minimal full-screen `bg-background` skeleton with no onboarding banner.
- If guest requests private tab via `/?tab=wallet`, render market and replace URL with `/?tab=market` or omit `tab`.

Expected behavior:

| URL            | Loading/reconnect  | Guest                            | Authenticated  |
| -------------- | ------------------ | -------------------------------- | -------------- |
| `/`            | skeleton           | Market                           | Market         |
| `/?tab=market` | skeleton           | Market                           | Market         |
| `/?tab=wallet` | skeleton           | Market + banner                  | Wallet         |
| `/onboarding`  | skeleton if needed | Sign-up flow                     | replace to `/` |
| `/wallet/*`    | skeleton if needed | Auth-required screen at same URL | Wallet flow    |

### 10. Split tab model

Update `apps/web/src/features/home/ui/tabs.ts`:

- `homeTabs`: all signed-in tabs.
- `publicHomeTabs`: `['market']`.
- `privateHomeTabs`: `['wallet', 'activity', 'pool', 'settings']`.
- `parseHomeTab` defaults to `market`.
- Add `isPrivateHomeTab(tab)`.

### 11. Make `HomePage` auth-aware

Update `apps/web/src/features/home/ui/home-page.tsx`:

- Add `isAuthenticated: boolean` prop.
- Default fallback tab to `market`.
- If not authenticated and current tab is private, render market.
- Show onboarding banner in guest or `connectedNoSession` mode as appropriate.
- Render `BottomNavigation` with auth state.
- Keep sign-out only available in authenticated settings.
- Do not render wallet/activity/pool/settings content for guests.

### 12. Fix bottom-navigation guest layout

Update `apps/web/src/features/home/ui/bottom-navigation.tsx`:

- Add `isAuthenticated` prop.
- Authenticated: five-column layout.
- Guest: render only market with a one-column/centered layout.
- Add a unit/visual assertion that guest nav does not reserve empty slots.

### 13. Add compact onboarding/sign-in banner

Create `apps/web/src/features/home/ui/onboarding-banner.tsx`.

Requirements:

- Flat mobile surface: `rounded-xl border border-border bg-card p-3`.
- Copy: short, e.g. “Join CLC to send, swap, redeem, and manage vouchers.”
- Primary “Sign up” navigates to `/onboarding`, preserving a validated redirect when there is current private intent.
- Secondary “Sign in” opens a bottom sheet/dialog containing `components/auth/SignInPanel`.
- Include guest language/theme access here or adjacent market chrome.

### 14. Update `/onboarding` for auth and redirects

Update `apps/web/src/routes/onboarding.tsx`:

- Add typed/validated search param: `redirect?: string`.
- Accept only internal paths beginning with `/`; reject external URLs and protocol-relative URLs.
- Use `useAuthStatus()`:
  - loading: fallback skeleton;
  - authenticated: replace to validated `redirect ?? '/'`;
  - guest/connectedNoSession: render onboarding.
- On `OnboardingFlow` completion, replace to validated `redirect ?? '/'`.

This preserves deep-link intent through sign-up.

### 15. Gate direct private wallet routes with wrapper

Create `apps/web/src/components/auth/authenticated-route.tsx`.

Behavior:

- Uses `useAuthStatus()`.
- `loading`: skeleton.
- `authenticated`: render `children`.
- `connectedNoSession`: render re-auth/auth-required screen.
- `guest`: render auth-required screen.
- `sessionCheckError`: show retry; do not force guest state.
- The auth-required screen opens `SignInPanel`, links back to `/`, and offers sign-up with `/onboarding?redirect=<current path>`.
- It does **not** redirect for sign-in. Route intent is preserved because URL stays unchanged.

Wrap every route in `apps/web/src/routes/wallet/**` with `AuthenticatedRoute`.

### 16. Market interactions

Do not add auth gates where no private action exists yet.

Current `MarketPage` has only:

- location button;
- `Browse all` button with no action;
- location preview button with no action.

For this iteration:

- Keep geolocation available to guests.
- Keep public browsing actions available to guests.
- Defer `onAuthRequired` props until actual shop/offering transactional actions exist, or wire it only when `Browse all` navigates to a private/non-public screen.

### 17. Notification and service-worker auth behavior

In guest mode:

- Keep service worker/update policy active.
- Keep notification recovery safe with `currentWalletAddress: undefined`.
- Only wallet-linked notification recovery/subscription linking should run when `isAuthenticated` and `address` exist.
- Settings/notification UI remains hidden for guests.

### 18. Change `?w=` URL import behavior

Current root import flow silently connects a private key when disconnected.

New behavior:

- Guest + raw/encrypted `?w=`:
  - strip the URL param;
  - open explicit sign-in/import prompt;
  - require confirmation/unlock before backend sign-in and wagmi connect.
- Authenticated + `?w=`:
  - keep existing switch-wallet dialog.
- Invalid `?w=`:
  - strip param and stay on public market.

### 19. Optional profile-incomplete follow-up

Lower priority. Once backend/product chooses unified auth or profile completion rules:

- After `authenticated`, query profile.
- If missing/empty profile, route to onboarding profile step with the same validated redirect plumbing.
- Keep this out of the first implementation if it expands scope.

## Tests to update/add

### Unit/component tests

- `apps/web/src/features/auth/hooks/use-auth-status.ts`
  - loading while `!reconnectAttempted`;
  - guest after reconnect settles with no wallet;
  - `connectedNoSession` on `204`;
  - `connectedNoSession` on address mismatch;
  - `sessionCheckError` on 5xx/network;
  - authenticated on matching `200` session.
- `apps/web/src/components/auth/sign-in-panel.tsx`
  - private key/paper wallet calls backend sign-in before connect;
  - encrypted wallet decrypts then uses same path;
  - `404` routes to sign-up with redirect;
  - `403` shows approval UI;
  - passkey path never calls `signMessage`;
  - calls `onAuthenticated` and does not navigate itself.
- Global 401 handling
  - protected query/mutation error with `401`/`E06` invalidates auth session and leads to `connectedNoSession`.
- `apps/web/src/components/auth/authenticated-route.tsx`
  - skeleton while loading;
  - auth-required screen for guests at same route;
  - re-auth action for `connectedNoSession` EOA connectors;
  - passkey connector shows session unavailable;
  - sign-up redirect preserves original target;
  - children render once authenticated.
- `apps/web/src/features/home/ui/onboarding-banner.tsx`
  - sign-up navigates to `/onboarding` with redirect when applicable;
  - sign-in opens `SignInPanel`;
  - guest language/theme control is visible.
- `apps/web/src/routes/-index.test.tsx`
  - disconnected `/` renders market/home shell, not full-screen landing;
  - first-paint/reconnect loading renders skeleton, not guest banner;
  - authenticated `/` defaults to market;
  - private tab requested while guest falls back to market;
  - private tab requested while authenticated renders private tab.
- `apps/web/src/routes/onboarding` tests
  - authenticated users replace to `/` or validated redirect;
  - guests can access sign-up flow;
  - invalid external redirects are ignored.
- `apps/web/src/features/home/ui/-home-page.test.tsx`
  - default tab is market;
  - guest sees market and onboarding banner;
  - guest cannot render wallet/activity/pool/settings;
  - authenticated user sees all tabs;
  - sign-out returns to guest market mode.
- `apps/web/src/features/home/ui/-bottom-navigation.test.tsx`
  - guest nav renders only public market entry and uses non-broken layout;
  - authenticated nav renders all five.
- `apps/web/src/features/home/ui/-market-page.test.tsx`
  - guest can view map and preview;
  - geolocation remains available to guests;
  - defer private action tests until private market CTAs exist.
- `apps/web/src/features/onboarding/ui/-landing-page.test.tsx`
  - migrate relevant cases to `SignInPanel` tests, then remove or shrink this test with the deprecated component.

### E2E tests

Update `apps/web/e2e/fixtures.ts`:

- `connectViaOnboarding` must wait for authenticated market shell or preserved private route, not the old `Wallet` heading.
- `signOut` must wait for guest market + hidden private nav/banner state, not old full-screen landing.

Update `apps/web/e2e/auth-flow.spec.ts`:

- Landing page tests now expect market map + compact onboarding banner.
- “Sign up” opens `/onboarding`.
- “Sign in” opens the sign-in panel.
- Onboarding completion lands on market by default or validated redirect.
- Sign-out leaves user on public market.
- URL import tests expect explicit import prompt for guests and market after successful import unless testing a private deep link.
- Add private deep-link test:
  - disconnected `/wallet/send` shows auth-required prompt;
  - after sign-in, `/wallet/send` content appears without URL restoration logic.

Update or replace:

- `apps/web/e2e/onboarding.spec.ts`
- `apps/web/e2e/paper-wallet.spec.ts`

where they rely on the `Wallet` heading immediately after auth.

## Documentation updates

Update `docs/AUTH.md` after implementation:

- Replace old “disconnected = LandingPage / connected = HomePage” diagrams.
- Document public market browsing.
- Document auth states: loading, guest, connectedNoSession, authenticated, sessionCheckError.
- Document `/auth/session` as the source of frontend session truth.
- Document sign-in panel callbacks/no hard-coded navigation.
- Document Calibur/passkey session limitation and interim UI.
- Document wallet route guard behavior and intent preservation.
- Document explicit `?w=` import behavior.

## Backend decisions to track separately

Do not implement these in this frontend plan, but record them for backend planning:

1. Passkey/Calibur sessions need ERC-1271/6492 verification, Calibur `signMessage`, or a WebAuthn assertion session endpoint.
2. Decide legacy split auth (`/auth/signin` + `/auth/signup`, auto-approve) vs unified `/auth/siwe/verify` with pending approval.
3. Confirm production cookie behavior for app/API domains (`SameSite=Strict` may fail cross-site).
4. Consider normalizing `/auth/session` response envelope or adding profile-completion metadata.

## Internationalization

This change adds/changes user-facing copy. After implementation:

```sh
pnpm i18n:extract
```

Then fill the new non-English `msgstr` entries in `packages/i18n/src/catalogs/sw/messages.po`.

## Validation commands

After implementation:

```sh
vp check
vp test
```

Do not run `vp build` unless explicitly requested.

## Suggested implementation sequence

1. Add `getSession()` client wrapper.
2. Add auth bootstrap readiness flag and wire it into `ReconnectOnMount`.
3. Add `useAuthStatus` with `/auth/session` state machine and tests.
4. Add global `401`/`E06` session invalidation.
5. Remove dead token store and update sign-out.
6. Update tab model to default to market.
7. Extract `components/auth/SignInPanel`, approval/session-unavailable UI, and SIWE-capability guard.
8. Add connected-no-session re-auth affordance.
9. Make `HomePage` auth-aware and support guest market mode.
10. Update root route to public market with loading skeleton.
11. Add onboarding banner with sign-up/sign-in actions and guest language/theme access.
12. Update bottom navigation guest layout.
13. Add `AuthenticatedRoute` and wrap all `/wallet/**` routes.
14. Update `/onboarding` auth redirect and validated `redirect` search param.
15. Change guest `?w=` handling to explicit import prompt.
16. Migrate unit tests and e2e fixtures/specs.
17. Update `docs/AUTH.md`.
18. Run i18n extraction, `vp check`, and `vp test`.
