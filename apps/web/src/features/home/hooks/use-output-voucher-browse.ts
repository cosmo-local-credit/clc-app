import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { MARKET_QUERY_FRESHNESS } from "#/features/home/hooks/use-market-vouchers";
import { usePoolOutputAvailability } from "#/features/pools/hooks/use-pool-output-availability";
import { marketClient } from "#/lib/api/market";
import { CHAIN_ID } from "#/lib/chain";
import { parsePoolOutputVoucher, type PoolRouteSearch } from "#/lib/navigation/pool-search";

type Credit = Pick<ReturnType<typeof useCreditableBrowse>, "enabled" | "poolRefs">;
type PoolRef = { chainId: number; address: string };

/**
 * The requested output voucher of a discovery link (`out_voucher`), as the
 * phone Pools page reads it, for a screen that lists or maps pools: which
 * pools can currently pay it out, and which of them discovery may show.
 *
 * `poolRefs` is the one pool restriction to send with a discovery request. It
 * is the pools that can provide the voucher, narrowed to the viewer's Credit
 * pools while Credit is on, so the two filters intersect. With neither active
 * it is `undefined`, which is the whole catalog, so a screen must not fetch
 * while `blocksResults`: an empty list would otherwise read as "no restriction".
 */
export function useOutputVoucherBrowse(value: PoolRouteSearch["out_voucher"], credit: Credit) {
  const parsed = parsePoolOutputVoucher(value);
  const address = parsed.ok ? parsed.address : null;
  const availability = usePoolOutputAvailability(
    address ? { chainId: CHAIN_ID, address } : undefined,
  );
  const detail = useQuery({
    ...voucherQueryOptions(marketClient, address ?? undefined),
    ...MARKET_QUERY_FRESHNESS,
  });

  const invalid = !parsed.ok;
  const active = address !== null;
  const ready = active && availability.status === "ready";

  const outputRefs = useMemo<PoolRef[] | undefined>(
    () =>
      ready
        ? availability.pools.map((pool) => ({
            chainId: pool.chainId ?? CHAIN_ID,
            address: pool.address,
          }))
        : undefined,
    [availability.pools, ready],
  );
  const creditRefs = credit.enabled ? credit.poolRefs : undefined;
  const poolRefs = useMemo<PoolRef[] | undefined>(() => {
    if (outputRefs && creditRefs) {
      const allowed = new Set(creditRefs.map((pool) => pool.address.toLowerCase()));
      return outputRefs.filter((pool) => allowed.has(pool.address.toLowerCase()));
    }
    return outputRefs ?? (creditRefs ? [...creditRefs] : undefined);
  }, [creditRefs, outputRefs]);

  const state: "off" | "invalid" | "loading" | "error" | "ready" = invalid
    ? "invalid"
    : !active
      ? "off"
      : availability.status === "ready"
        ? "ready"
        : availability.status === "error"
          ? "error"
          : "loading";

  return {
    state,
    invalid,
    active,
    address,
    /** The voucher's real symbol once its page data is in; the chip waits for it. */
    symbol: detail.data?.symbol ?? null,
    availability: {
      status: availability.status,
      isRefreshing: availability.isRefreshing,
      hasVerificationGaps: availability.hasVerificationGaps,
      retry: availability.retry,
      retrying: availability.retrying,
    },
    poolRefs,
    /** Nothing may be requested: a bad link, a check still running or failed, or no pool left. */
    blocksResults: invalid || (active && (state !== "ready" || poolRefs?.length === 0)),
    /** The check succeeded and left no pool, with Credit already applied. */
    isEmpty: ready && poolRefs?.length === 0,
  };
}

export type OutputVoucherBrowse = ReturnType<typeof useOutputVoucherBrowse>;
