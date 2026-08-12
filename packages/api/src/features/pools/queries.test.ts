import { describe, expect, it } from "vite-plus/test";
import type { PoolsClient, UserPoolPage } from "./client";
import {
  poolKeys,
  poolListInfiniteQueryOptions,
  poolQueryOptions,
  poolVouchersInfiniteQueryOptions,
} from "./queries";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

function page(received: number, last: number | undefined): UserPoolPage {
  return { pools: [], receivedCount: received, last } as UserPoolPage;
}

describe("poolKeys", () => {
  it("hangs every key off `all` so one invalidation reaches them", () => {
    // A pool deploy invalidates poolKeys.all; anything not prefixed by it would
    // silently keep serving stale data.
    for (const key of [
      poolKeys.list(20),
      poolKeys.listInfinite(20),
      poolKeys.detail(ADDRESS),
      poolKeys.vouchers(ADDRESS, 20),
      poolKeys.vouchersInfinite(ADDRESS, 20),
      poolKeys.filtered(null, 20),
      poolKeys.facetVocabulary(),
    ]) {
      expect(key.slice(0, poolKeys.all.length)).toEqual([...poolKeys.all]);
    }
  });

  it("gives finite and infinite reads distinct keys", () => {
    // Their cached shapes differ — a page versus { pages, pageParams } — so one
    // must never be read as the other.
    expect(poolKeys.list(20)).not.toEqual(poolKeys.listInfinite(20));
    expect(poolKeys.vouchers(ADDRESS, 20)).not.toEqual(poolKeys.vouchersInfinite(ADDRESS, 20));
  });

  it("normalizes address casing so one pool has one key", () => {
    expect(poolKeys.detail(ADDRESS)).toEqual(poolKeys.detail(ADDRESS.toUpperCase()));
    expect(poolKeys.vouchers(ADDRESS, 20)).toEqual(poolKeys.vouchers(ADDRESS.toLowerCase(), 20));
  });

  it("varies the key with every parameter that changes the rows returned", () => {
    expect(poolKeys.list(20)).not.toEqual(poolKeys.list(50));
    expect(poolKeys.vouchers(ADDRESS, 20)).not.toEqual(poolKeys.vouchers(ADDRESS, 50));
    expect(poolKeys.filtered(null, 20)).not.toEqual(poolKeys.filtered(null, 50));
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
    expect(poolVouchersInfiniteQueryOptions({} as PoolsClient, undefined, 20).enabled).toBe(false);
  });

  it("keys a missing address distinctly instead of colliding with a real one", () => {
    expect(poolKeys.detail("none")).toEqual(
      poolQueryOptions({} as PoolsClient, undefined).queryKey,
    );
  });
});
