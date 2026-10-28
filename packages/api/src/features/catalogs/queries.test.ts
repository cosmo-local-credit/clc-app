import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import type { CatalogsClient } from "./client";
import { retryTransientBackendRead } from "../../client/errors";
import {
  catalogCompleteMembersQueryOptions,
  catalogKeys,
  catalogMembershipQueryOptions,
  catalogMemberMutationOptions,
  catalogsInfiniteQueryOptions,
  myCatalogsQueryOptions,
  saveCatalogMutationOptions,
} from "./queries";

describe("catalog cache", () => {
  it("isolates users, nearby origins, member types and public discovery", () => {
    expect(catalogKeys.mine("0xABC")).toEqual(catalogKeys.mine("0xabc"));
    expect(catalogKeys.mine("A")).not.toEqual(catalogKeys.mine("B"));
    expect(catalogKeys.list("A:1:2:1000")).not.toEqual(catalogKeys.list("A:2:2:1000"));
    expect(catalogKeys.list()).not.toEqual(catalogKeys.list("A:1:2:1000"));
    expect(catalogKeys.list({ scope: "A:1:2:1000", q: " maize " })).toEqual(
      catalogKeys.list({ scope: "A:1:2:1000", q: "maize" }),
    );
    expect(catalogKeys.list({ scope: "A:1:2:1000", q: "maize" })).not.toEqual(
      catalogKeys.list({ scope: "A:1:2:1000", q: "beans" }),
    );
    expect(catalogKeys.members("1", "pool")).not.toEqual(catalogKeys.members("1", "voucher"));
    const client = {} as CatalogsClient;
    expect(catalogMembershipQueryOptions(client, "", "1", "pool", "2").enabled).toBe(false);
    expect(catalogMembershipQueryOptions(client, "A", "", "pool", "2").enabled).toBe(false);
    expect(myCatalogsQueryOptions(client, "A").retry).toBe(retryTransientBackendRead);
  });
  it("passes the backend cursor unchanged and stops at null", () => {
    const options = catalogsInfiniteQueryOptions({} as CatalogsClient);
    expect(
      options.getNextPageParam({ catalogs: [], nextCursor: "opaque" }, [], undefined, []),
    ).toBe("opaque");
    expect(
      options.getNextPageParam({ catalogs: [], nextCursor: null }, [], undefined, []),
    ).toBeUndefined();
  });
  it("drains catalog membership without sharing the visible infinite-list cache", async () => {
    const members = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: "2", address: `0x${"a".repeat(40)}` }],
        nextCursor: "opaque",
      })
      .mockResolvedValueOnce({
        items: [{ id: "3", address: `0x${"b".repeat(40)}` }],
        nextCursor: null,
      });
    const client = { members } as unknown as CatalogsClient;
    const options = catalogCompleteMembersQueryOptions(client, "1", "voucher");
    const signal = new AbortController().signal;

    expect(options.queryKey).toEqual(catalogKeys.completeMembers("1", "voucher"));
    expect(options.queryKey).not.toEqual(catalogKeys.members("1", "voucher"));
    await expect(options.queryFn?.({ signal } as never)).resolves.toEqual([
      { id: "2", address: `0x${"a".repeat(40)}` },
      { id: "3", address: `0x${"b".repeat(40)}` },
    ]);
    expect(members).toHaveBeenNthCalledWith(1, "1", "voucher", undefined, signal);
    expect(members).toHaveBeenNthCalledWith(2, "1", "voucher", "opaque", signal);
  });
  it("isolates verified pools and forwards scoped discovery parameters", async () => {
    const list = vi.fn().mockResolvedValue({ catalogs: [], nextCursor: null });
    const client = { list } as unknown as CatalogsClient;
    const pools = [{ chainId: 100, address: `0x${"A".repeat(40)}` }];
    const options = catalogsInfiniteQueryOptions(client, {
      scope: "nearby:account:100:1:2:500",
      nearby: true,
      q: " maize ",
      tags: ["Food"],
      tagMatch: "all",
      pools,
    });

    expect(options.queryKey).toEqual(
      catalogKeys.list({
        scope: "nearby:account:100:1:2:500",
        nearby: true,
        q: " maize ",
        tags: ["Food"],
        tagMatch: "all",
        pools,
      }),
    );
    const signal = new AbortController().signal;
    await options.queryFn?.({ pageParam: "opaque", signal } as never);
    expect(list).toHaveBeenCalledWith(
      {
        cursor: "opaque",
        nearby: true,
        q: " maize ",
        tags: ["Food"],
        tagMatch: "all",
        pools,
        facets: true,
      },
      signal,
    );

    expect(catalogsInfiniteQueryOptions(client, "nearby:guest").queryKey).toEqual(
      catalogKeys.list({ scope: "nearby:guest" }),
    );
  });
  it("refreshes counts and lists while retaining the confirmed membership", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const options = catalogMemberMutationOptions({} as CatalogsClient, queryClient, "A");
    await options.onSuccess?.(
      { added: true },
      { catalogId: "1", kind: "pool", resourceId: "2", added: true },
      undefined,
      {} as never,
    );
    expect(queryClient.getQueryData(catalogKeys.membership("A", "1", "pool", "2"))).toEqual({
      added: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: catalogKeys.all });
  });
  it("seeds saved details and invalidates discovery and the wallet", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const options = saveCatalogMutationOptions({} as CatalogsClient, queryClient);
    const catalog = { id: "1", name: "New" } as Awaited<ReturnType<CatalogsClient["create"]>>;
    await options.onSuccess?.(catalog, {} as never, undefined, {} as never);
    expect(queryClient.getQueryData(catalogKeys.detail("1"))).toEqual(catalog);
    expect(invalidate).toHaveBeenCalled();
  });
});

it("does not infer request credentials from cache identity", async () => {
  const list = vi.fn().mockResolvedValue({ catalogs: [], nextCursor: null });
  const client = { list } as unknown as CatalogsClient;
  const options = catalogsInfiniteQueryOptions(client, { scope: "nearby:arbitrary-label" });
  const signal = new AbortController().signal;
  await options.queryFn?.({ pageParam: undefined, signal } as never);
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ nearby: false }), signal);
});
