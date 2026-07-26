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

- `apps/web/src/features/wallet/hooks/use-pretium.ts`
  - Pretium onramp/offramp history (`usePretiumTransactionsByAddress`)
  - `staleTime: 4_000`
  - `refetchInterval: 5_000`
  - `refetchOnWindowFocus: true`
  - `refetchOnReconnect: true`
  - `refetchIntervalInBackground: false`
  - Reason: the upstream Pretium status poller confirms onramps within seconds; the Cash page shows live status while mounted, mirroring wallet account freshness. Rates stay at `staleTime: 60_000`.

- `apps/web/src/features/home/hooks/use-market-vouchers.ts`
  - public market voucher catalog (full infinite catalog + one bbox bootstrap page)
  - `staleTime: 10 * 60_000`
  - `gcTime: 30 * 60_000`
  - `refetchOnReconnect: false`
  - Reason: this is a bulk import of static catalog data, not live chain state.
    The one-minute global `staleTime` would re-walk every cached page of a
    multi-page import, and the five-minute default GC time would discard the
    assembled catalog on every home-tab switch, forcing a full re-download.
  - Exported as `MARKET_QUERY_FRESHNESS` and reused by
    `use-market-voucher-detail.ts`, below.

- `apps/web/src/features/home/hooks/use-market-voucher-detail.ts`
  - one public voucher by contract address (`GET /api/v2/vouchers/:address`)
  - reuses `MARKET_QUERY_FRESHNESS` from `use-market-vouchers.ts`
  - Reason: the same static catalog, read one row at a time. The map card and the
    voucher page share a single cache entry — the key lowercases the address, so
    tapping a marker warms exactly the entry the page then reads and navigation
    renders with no loading state. Under the global one-minute `staleTime` every
    reopened card would refetch instead.

- `apps/web/src/features/home/hooks/use-ip-camera.ts`
  - IP/country camera bootstrap for the Market map
  - `staleTime: Infinity`
  - `gcTime: 24 * 60 * 60_000`
  - `retry: 0`
  - `refetchOnReconnect: false`
  - Reason: an IP does not move during a session, so this resolves once and is
    reused across every home-tab remount. It is the fallback path behind GPS and
    persisted location, so a failure must fall through immediately rather than
    retrying — it must never block basemap rendering.

- `apps/web/src/features/auth/hooks/use-otx-tracking.ts`
  - operation tracking
  - polls while the operation is pending, then stops
  - `refetchIntervalInBackground: true`
  - Reason: this is a short-lived confirmation flow, not general account data.

When adding a new endpoint, start with the global defaults. Add a local freshness policy only when the product behavior requires it, such as live wallet/account state, tracking flows, or explicit polling UX.
