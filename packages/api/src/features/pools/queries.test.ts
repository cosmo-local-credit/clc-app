import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { describe, expect, it, vi } from "vite-plus/test";
import type { PoolsClient, UserPoolPage } from "./client";
import {
  poolKeys,
  poolInfoQueryOptions,
  poolListInfiniteQueryOptions,
  poolQueryOptions,
  poolVouchersInfiniteQueryOptions,
} from "./queries";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const FILTER: CatalogFilter = {
  term: "market",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

function page(received: number, last: number | undefined): UserPoolPage {
  return { pools: [], receivedCount: received, last } as UserPoolPage;
}

describe("poolKeys", () => {
  it("hangs every key off `all` so one invalidation reaches them", () => {
    // A pool deploy invalidates poolKeys.all; anything not prefixed by it would
    // silently keep serving stale data.
    for (const key of [
      poolKeys.list({ perPage: 20 }),
      poolKeys.listInfinite(20),
      poolKeys.detail(ADDRESS),
      poolKeys.info(ADDRESS, ADDRESS),
      poolKeys.vouchers(ADDRESS, 20),
      poolKeys.vouchersInfinite(ADDRESS, 20),
      poolKeys.filtered(null, 20),
      poolKeys.filteredPage({ perPage: 20, filter: FILTER }),
      poolKeys.facetVocabulary(),
    ]) {
      expect(key.slice(0, poolKeys.all.length)).toEqual([...poolKeys.all]);
    }
  });

  it("gives finite and infinite reads distinct keys", () => {
    // Their cached shapes differ — a page versus { pages, pageParams } — so one
    // must never be read as the other.
    expect(poolKeys.list({ perPage: 20 })).not.toEqual(poolKeys.listInfinite(20));
    expect(poolKeys.vouchers(ADDRESS, 20)).not.toEqual(poolKeys.vouchersInfinite(ADDRESS, 20));
  });

  it("normalizes address casing so one pool has one key", () => {
    expect(poolKeys.detail(ADDRESS)).toEqual(poolKeys.detail(ADDRESS.toUpperCase()));
    expect(poolKeys.vouchers(ADDRESS, 20)).toEqual(poolKeys.vouchers(ADDRESS.toLowerCase(), 20));
  });

  it("isolates authenticated info by pool and viewer", () => {
    const viewer = `0x${"b".repeat(40)}`;
    expect(poolKeys.info(ADDRESS, viewer)).toEqual(
      poolKeys.info(ADDRESS.toUpperCase(), viewer.toUpperCase()),
    );
    expect(poolKeys.info(ADDRESS, viewer)).not.toEqual(poolKeys.info(ADDRESS, ADDRESS));
    expect(poolKeys.info(ADDRESS, viewer)).not.toEqual(poolKeys.detail(ADDRESS));
  });

  it("varies the key with every parameter that changes the rows returned", () => {
    expect(poolKeys.list({ perPage: 20 })).not.toEqual(poolKeys.list({ perPage: 50 }));
    expect(poolKeys.list({ perPage: 20 })).not.toEqual(
      poolKeys.list({ perPage: 20, cursor: 480, next: true }),
    );
    // The same cursor forwards and backwards addresses different rows.
    expect(poolKeys.list({ perPage: 20, cursor: 480, next: true })).not.toEqual(
      poolKeys.list({ perPage: 20, cursor: 480, next: false }),
    );
    expect(poolKeys.vouchers(ADDRESS, 20)).not.toEqual(poolKeys.vouchers(ADDRESS, 50));
    expect(poolKeys.filtered(null, 20)).not.toEqual(poolKeys.filtered(null, 50));
    // A term is a server parameter, so two terms are two results.
    expect(poolKeys.filteredPage({ perPage: 20, filter: FILTER })).not.toEqual(
      poolKeys.filteredPage({ perPage: 20, filter: { ...FILTER, term: "coffee" } }),
    );
    expect(poolKeys.filteredPage({ perPage: 20, filter: FILTER })).not.toEqual(
      poolKeys.filteredPage({ perPage: 20, cursor: 480, next: true, filter: FILTER }),
    );
    // One page of a filtered list and a whole assembled catalog cache different
    // shapes, so they must not share a key.
    expect(poolKeys.filteredPage({ perPage: 20, filter: FILTER })).not.toEqual(
      poolKeys.filtered(FILTER, 20),
    );
  });
});

describe("poolListInfiniteQueryOptions", () => {
  const options = poolListInfiniteQueryOptions({} as PoolsClient, 20);

  it("starts with no cursor", () => {
    expect(options.initialPageParam).toBeUndefined();
  });

  it("stops when a short page proves the end was reached", () => {
    expect(options.getNextPageParam(page(19, 500), [], undefined, [])).toBeUndefined();
  });

  it("stops when the backend returns no cursor", () => {
    expect(options.getNextPageParam(page(20, undefined), [], undefined, [])).toBeUndefined();
  });

  it("continues from the last cursor on a full page", () => {
    expect(options.getNextPageParam(page(20, 500), [], undefined, [])).toBe(500);
  });
});

describe("address-scoped options", () => {
  it("stays disabled without an address rather than requesting /pools/undefined", () => {
    expect(poolQueryOptions({} as PoolsClient, undefined).enabled).toBe(false);
    expect(poolQueryOptions({} as PoolsClient, ADDRESS).enabled).toBe(true);
    expect(poolInfoQueryOptions({} as PoolsClient, ADDRESS, undefined).enabled).toBe(false);
    expect(poolInfoQueryOptions({} as PoolsClient, undefined, ADDRESS).enabled).toBe(false);
    expect(poolVouchersInfiniteQueryOptions({} as PoolsClient, undefined, 20).enabled).toBe(false);
  });

  it("forwards cancellation to authenticated pool info", async () => {
    const getPoolInfo = vi.fn().mockResolvedValue({ address: ADDRESS });
    const options = poolInfoQueryOptions(
      { getPoolInfo } as unknown as PoolsClient,
      ADDRESS,
      ADDRESS,
    );
    const signal = new AbortController().signal;
    await options.queryFn?.({ signal } as never);
    expect(getPoolInfo).toHaveBeenCalledWith(ADDRESS, signal);
  });

  it("keys a missing address distinctly instead of colliding with a real one", () => {
    expect(poolKeys.detail("none")).toEqual(
      poolQueryOptions({} as PoolsClient, undefined).queryKey,
    );
  });
});
