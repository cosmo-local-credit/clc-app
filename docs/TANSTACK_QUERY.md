# TanStack Query freshness policy

Do not tune server-state freshness by changing the global `QueryClient` defaults unless the new behavior should apply to every query in the app.

The web app global defaults live in `apps/web/src/router.tsx`:

```ts
queries: {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
}
```

These are conservative defaults for normal app data: cache for one minute, do not refetch just because the mobile browser regains focus, and retry failed reads once.

For endpoints with different freshness needs, set options on that query hook instead. Keep the policy next to the feature hook so future tuning is local and obvious.

Current local overrides:

- `apps/web/src/features/wallet/hooks/use-account-balances.ts`
  - account token balances and transfer history
  - `staleTime: 4_000`
  - `refetchInterval: 5_000`
  - `refetchOnWindowFocus: true`
  - `refetchOnReconnect: true`
  - `refetchIntervalInBackground: false`
  - Reason: transfers confirm quickly and wallet UI should feel near-realtime while avoiding background polling on mobile.

- `apps/web/src/features/auth/hooks/use-otx-tracking.ts`
  - operation tracking
  - polls while the operation is pending, then stops
  - `refetchIntervalInBackground: true`
  - Reason: this is a short-lived confirmation flow, not general account data.

When adding a new endpoint, start with the global defaults. Add a local freshness policy only when the product behavior requires it, such as live wallet/account state, tracking flows, or explicit polling UX.
