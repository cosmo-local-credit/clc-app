import { QueryClient } from "@tanstack/react-query";
import type { WantWrite } from "@clc/core/features/wants/logic";
import { describe, expect, it, vi } from "vite-plus/test";
import type { WantsClient } from "./client";
import { retryTransientBackendRead } from "../../client/errors";
import {
  myWantQueryOptions,
  myWantsInfiniteQueryOptions,
  poolWantsInfiniteQueryOptions,
  saveWantMutationOptions,
  wantCreatorPoolsInfiniteQueryOptions,
  wantCreatorVouchersInfiniteQueryOptions,
  wantDetailQueryOptions,
  wantContactQueryOptions,
  wantKeys,
  wantsInfiniteQueryOptions,
} from "./queries";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";
const SIGNAL = new AbortController().signal;
const WRITE = {} as WantWrite;

function page(length: number, last: number) {
  return {
    wants: Array.from({ length }, (_, index) => ({ id: String(index + 1) })),
    first: length ? 1 : 0,
    last,
  };
}

describe("Want query keys", () => {
  it("normalizes address-scoped keys and keeps resource families separate", () => {
    expect(wantKeys.mine(ADDRESS)).toEqual(wantKeys.mine(ADDRESS.toLowerCase()));
    expect(wantKeys.pool(ADDRESS)).toEqual(wantKeys.pool(ADDRESS.toLowerCase()));
    expect(wantKeys.creatorVouchers("7")).not.toEqual(wantKeys.creatorPools("7"));
    expect(wantKeys.detail("7")).not.toEqual(wantKeys.detail("8"));
    expect(wantKeys.contact("7", ADDRESS)).toEqual(wantKeys.contact("7", ADDRESS.toLowerCase()));
    expect(wantKeys.contact("7", ADDRESS)).not.toEqual(wantKeys.detail("7"));
  });

  it("wallet-scopes contact reads and forwards cancellation", async () => {
    const contact = vi.fn().mockResolvedValue({ text: "Meet outside" });
    const client = { contact } as unknown as WantsClient;
    expect(wantContactQueryOptions(client, "7", undefined).enabled).toBe(false);
    expect(wantContactQueryOptions(client, "", ADDRESS).enabled).toBe(false);

    const options = wantContactQueryOptions(client, "7", ADDRESS);
    await options.queryFn?.({ signal: SIGNAL } as never);
    expect(contact).toHaveBeenCalledWith("7", SIGNAL);
  });
});

describe("Want infinite query options", () => {
  it("forwards list pagination and stops after short or terminal pages", async () => {
    const list = vi.fn().mockResolvedValue(page(20, 7));
    const options = wantsInfiniteQueryOptions({ list } as unknown as WantsClient, {
      perPage: 20,
      q: "repair",
    });

    expect(options.initialPageParam).toBeUndefined();
    await options.queryFn?.({ pageParam: 9, signal: SIGNAL } as never);
    expect(list).toHaveBeenCalledWith({ perPage: 20, q: "repair", cursor: 9, next: true }, SIGNAL);
    expect(options.getNextPageParam(page(20, 7) as never, [], undefined, [])).toBe(7);
    expect(options.getNextPageParam(page(19, 7) as never, [], undefined, [])).toBeUndefined();
    expect(options.getNextPageParam(page(20, 0) as never, [], undefined, [])).toBeUndefined();
  });

  it("supports owner, pool, and detail reads with address/id guards", async () => {
    const mine = vi.fn().mockResolvedValue(page(20, 8));
    const pool = vi.fn().mockResolvedValue(page(20, 9));
    const detail = vi.fn().mockResolvedValue({ id: "7" });
    const client = { mine, pool, detail } as unknown as WantsClient;
    const mineOptions = myWantsInfiniteQueryOptions(client, ADDRESS);
    const poolOptions = poolWantsInfiniteQueryOptions(client, ADDRESS);
    const detailOptions = wantDetailQueryOptions(client, "7");

    expect(myWantsInfiniteQueryOptions(client, "").enabled).toBe(false);
    expect(poolWantsInfiniteQueryOptions(client, "").enabled).toBe(false);
    expect(wantDetailQueryOptions(client, "").enabled).toBe(false);
    expect(mineOptions.retry).toBe(retryTransientBackendRead);
    await mineOptions.queryFn?.({ pageParam: 4, signal: SIGNAL } as never);
    await poolOptions.queryFn?.({ pageParam: 5, signal: SIGNAL } as never);
    await detailOptions.queryFn?.({ signal: SIGNAL } as never);
    expect(mine).toHaveBeenCalledWith({ perPage: 20, cursor: 4 }, SIGNAL);
    expect(pool).toHaveBeenCalledWith(ADDRESS, { perPage: 20, cursor: 5 }, SIGNAL);
    expect(detail).toHaveBeenCalledWith("7", SIGNAL);
    expect(mineOptions.getNextPageParam(page(20, 8) as never, [], undefined, [])).toBe(8);
    expect(mineOptions.getNextPageParam(page(1, 8) as never, [], undefined, [])).toBeUndefined();
    expect(poolOptions.getNextPageParam(page(20, 9) as never, [], undefined, [])).toBe(9);
    expect(poolOptions.getNextPageParam(page(20, 0) as never, [], undefined, [])).toBeUndefined();
  });

  it("forwards creator-resource cursors and uses three-row pages", async () => {
    const creatorVouchers = vi.fn().mockResolvedValue({ vouchers: [], first: 0, last: 0 });
    const creatorPools = vi.fn().mockResolvedValue({ pools: [], first: 0, last: 0 });
    const client = { creatorVouchers, creatorPools } as unknown as WantsClient;
    const vouchers = wantCreatorVouchersInfiniteQueryOptions(client, "7");
    const pools = wantCreatorPoolsInfiniteQueryOptions(client, "7");

    expect(wantCreatorVouchersInfiniteQueryOptions(client, "").enabled).toBe(false);
    expect(wantCreatorPoolsInfiniteQueryOptions(client, "").enabled).toBe(false);
    await vouchers.queryFn?.({ pageParam: 4, signal: SIGNAL } as never);
    await pools.queryFn?.({ pageParam: 5, signal: SIGNAL } as never);
    expect(creatorVouchers).toHaveBeenCalledWith(
      "7",
      { perPage: 3, cursor: 4, next: true },
      SIGNAL,
    );
    expect(creatorPools).toHaveBeenCalledWith("7", { perPage: 3, cursor: 5, next: true }, SIGNAL);
    expect(
      vouchers.getNextPageParam({ vouchers: [{}, {}, {}], last: 6 } as never, [], undefined, []),
    ).toBe(6);
    expect(
      vouchers.getNextPageParam({ vouchers: [{}], last: 6 } as never, [], undefined, []),
    ).toBeUndefined();
    expect(
      pools.getNextPageParam({ pools: [{}, {}, {}], last: 7 } as never, [], undefined, []),
    ).toBe(7);
    expect(
      pools.getNextPageParam({ pools: [{}, {}, {}], last: 0 } as never, [], undefined, []),
    ).toBeUndefined();
  });
});

describe("owned Want detail lookup", () => {
  it("drains pages until it finds the requested Want", async () => {
    const mine = vi
      .fn()
      .mockResolvedValueOnce(page(50, 50))
      .mockResolvedValueOnce({ wants: [{ id: "target" }], first: 49, last: 49 });
    const options = myWantQueryOptions({ mine } as unknown as WantsClient, ADDRESS, "target");

    await expect(options.queryFn?.({ signal: SIGNAL } as never)).resolves.toEqual({ id: "target" });
    expect(mine).toHaveBeenNthCalledWith(1, { perPage: 50, cursor: undefined }, SIGNAL);
    expect(mine).toHaveBeenNthCalledWith(2, { perPage: 50, cursor: 50 }, SIGNAL);
  });

  it("stops on short, terminal, and repeated pages instead of looping forever", async () => {
    for (const responses of [[page(1, 1)], [page(50, 0)], [page(50, 50), page(50, 50)]]) {
      const mine = vi.fn();
      for (const response of responses) mine.mockResolvedValueOnce(response);
      const options = myWantQueryOptions({ mine } as unknown as WantsClient, ADDRESS, "missing");
      await expect(options.queryFn?.({ signal: SIGNAL } as never)).rejects.toThrow(
        "Want not found",
      );
      expect(mine).toHaveBeenCalledTimes(responses.length);
    }
    expect(myWantQueryOptions({} as WantsClient, "", "7").enabled).toBe(false);
    expect(myWantQueryOptions({} as WantsClient, ADDRESS, "").enabled).toBe(false);
  });
});

describe("Want save mutations", () => {
  it("selects create, update, or reopen and invalidates every dependent cache", async () => {
    const create = vi.fn().mockResolvedValue({ id: "7" });
    const update = vi.fn().mockResolvedValue({ id: "7" });
    const reopen = vi.fn().mockResolvedValue({ id: "7" });
    const client = { create, update, reopen } as unknown as WantsClient;
    const queryClient = new QueryClient();
    const remove = vi.spyOn(queryClient, "removeQueries");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const createOptions = saveWantMutationOptions(client, queryClient);
    const updateOptions = saveWantMutationOptions(client, queryClient, "7");
    const reopenOptions = saveWantMutationOptions(client, queryClient, "7", true);
    await createOptions.mutationFn?.(WRITE, {} as never);
    await updateOptions.mutationFn?.(WRITE, {} as never);
    await reopenOptions.mutationFn?.(WRITE, {} as never);
    expect(create).toHaveBeenCalledWith(WRITE);
    expect(update).toHaveBeenCalledWith("7", WRITE);
    expect(reopen).toHaveBeenCalledWith("7", WRITE);

    await createOptions.onSuccess?.({ id: "7" } as never, WRITE, undefined, {} as never);
    expect(remove).toHaveBeenCalledWith({ queryKey: wantKeys.detail("7") });
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});
