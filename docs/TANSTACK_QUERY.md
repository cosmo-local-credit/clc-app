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

- `apps/web/src/features/home/hooks/use-filtered-market-vouchers.ts`
  - filtered public market voucher catalog (one atomic cursor walk per filter)
  - `staleTime: 10 * 60_000` and `refetchOnReconnect: false`, shared with the unfiltered catalog
  - `gcTime: 5 * 60_000` — deliberately shorter than the unfiltered catalog's 30 minutes
  - `placeholderData: keepPreviousData`
  - `retry`: never for a 4xx or for the page-cap failure; otherwise the global single retry
  - Reason: there is one unfiltered catalog entry and holding it makes returning to the Market tab instant, but filtered entries are one per distinct filter a user settles on, each holding up to `MAX_FILTERED_PAGES × 500` rows. Under a 30-minute window a long session of searching accumulates dozens of them for no benefit — nobody returns to their twelfth search — so five minutes still covers back-navigation while bounding memory on a low-end device. `keepPreviousData` is what keeps the last complete result on screen while the next filter resolves; it is only trustworthy because the walk is atomic. The retry exclusions exist because the router's global `retry: 1` would otherwise double an invalid filter, a 429 against the burst it just exhausted, and a deterministic cap failure that re-walks every page to fail identically.
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

- `apps/web/src/features/home/hooks/use-voucher-offerings.ts`
  - public per-voucher offerings (`GET /api/v2/vouchers/:address/offerings`)
  - reuses `MARKET_QUERY_FRESHNESS` from `use-market-vouchers.ts`
  - Reason: offerings come from the same bulk-imported static catalog as market
    vouchers. Keeping the assembled pages for 30 minutes avoids a public
    voucher page refetch whenever the user switches tabs or revisits it.

- `apps/web/src/features/home/hooks/use-reports.ts`
  - report feed (`GET /api/v2/reports`) and one report's detail
  - voucher-scoped report feed reuses the filtered reports endpoint with one
    canonical `<chainId>:<lowercase-address>` relationship in both the request
    and query key; the query stays disabled until that stable identity is known
  - reuses `MARKET_QUERY_FRESHNESS` from `use-market-vouchers.ts`
  - Reason: reports are the same bulk-imported static catalog as market
    vouchers. The feed unmounts on every home-tab change, so the global
    one-minute `staleTime` would re-walk every cached page each time Posts is
    reopened. Canonical voucher keys also prevent address casing from creating
    duplicate caches when the same voucher is opened from Market, Wallet, or a
    pool.

- `apps/web/src/features/home/hooks/use-filtered-reports.ts` and
  `apps/web/src/features/pools/hooks/use-filtered-pools.ts`
  - filtered Posts and Pools catalogs (one atomic cursor walk per filter)
  - `staleTime: 10 * 60_000`, `gcTime: 5 * 60_000`,
    `placeholderData: keepPreviousData`, and `refetchOnReconnect: false`
  - query keys contain the complete canonical filter: term, tags, tag match,
    stable voucher references, and voucher match. Changing only a voucher
    relationship therefore cannot reuse rows cached for another selection.
  - a separate `facet-vocabulary` query fetches both tag and voucher facets;
    the first filtered page may replace those counts without changing the
    selected vocabulary.
  - Reason: these endpoints assemble the complete filtered set before exposing
    it. Keeping the previous atomic result avoids partial-list churn, while the
    shorter GC window bounds the number of full result sets accumulated as a
    user tries different tag and voucher combinations.

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

- `apps/admin/src/features/pools/use-pool-vouchers.ts`
  - a pool's voucher composition
  - `staleTime: 15_000`
  - `refetchOnWindowFocus: true`
  - `refetchOnReconnect: true`
  - polls at `3_000` only while a just-added voucher is still settling, then stops
  - gives up after `90_000`
  - `refetchIntervalInBackground: false`
  - Reason: adding a voucher is not a write to this catalog. The console signs three contract calls, the chain confirms them, eth-tracker decodes the logs and clc-core projects them into `pool_tokens` off NATS — so the row appears seconds after the transaction the operator watched succeed, and invalidating on success refetches the composition as it was. This is the `use-otx-tracking` shape rather than the wallet's fixed interval: an interval would poll every pool screen forever for a lag that only exists just after an add. The deadline exists because a stalled indexer means the row is never coming, and background polling stays off because this is a desktop console, not a phone the operator is watching.

- `apps/web/src/features/auth/hooks/use-otx-tracking.ts`
  - operation tracking
  - polls while the operation is pending, then stops
  - `refetchIntervalInBackground: true`
  - Reason: this is a short-lived confirmation flow, not general account data.

When adding a new endpoint, start with the global defaults. Add a local freshness policy only when the product behavior requires it, such as live wallet/account state, tracking flows, or explicit polling UX.
