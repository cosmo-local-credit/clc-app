import { describe, expect, it, vi } from "vite-plus/test";
import type { OwnedVoucherPage, OwnedVouchersClient } from "./owned-client";
import { ownedVoucherKeys, ownedVouchersInfiniteQueryOptions } from "./owned-queries";

const ADDRESS = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

describe("owned voucher queries", () => {
  it("uses case-insensitive wallet identity and isolates page sizes", () => {
    expect(ownedVoucherKeys.list(ADDRESS, 100)).toEqual(
      ownedVoucherKeys.list(ADDRESS.toLowerCase(), 100),
    );
    expect(ownedVoucherKeys.list(ADDRESS, 100)).not.toEqual(ownedVoucherKeys.list(ADDRESS, 20));
    expect(ownedVoucherKeys.list(ADDRESS, 100).slice(0, ownedVoucherKeys.all.length)).toEqual([
      ...ownedVoucherKeys.all,
    ]);
  });

  it("is disabled without an authenticated address", () => {
    expect(
      ownedVouchersInfiniteQueryOptions({} as OwnedVouchersClient, undefined, 100).enabled,
    ).toBe(false);
  });

  it("forwards cursor pagination and its abort signal", async () => {
    const list = vi.fn().mockResolvedValue({ vouchers: [], receivedCount: 0 });
    const options = ownedVouchersInfiniteQueryOptions(
      { list } as unknown as OwnedVouchersClient,
      ADDRESS,
      100,
    );
    const signal = new AbortController().signal;

    await options.queryFn?.({ pageParam: 42, signal } as never);

    expect(list).toHaveBeenCalledWith({ perPage: 100, cursor: 42, next: true }, signal);
  });

  it("continues full raw pages and stops on short or cursorless pages", () => {
    const options = ownedVouchersInfiniteQueryOptions({} as OwnedVouchersClient, ADDRESS, 100);
    const page = (receivedCount: number, last?: number): OwnedVoucherPage => ({
      vouchers: [],
      receivedCount,
      last,
    });

    expect(options.getNextPageParam(page(100, 42), [], undefined, [])).toBe(42);
    expect(options.getNextPageParam(page(99, 42), [], undefined, [])).toBeUndefined();
    expect(options.getNextPageParam(page(100), [], undefined, [])).toBeUndefined();
  });
});
