import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import type { CatalogsClient } from "./client";
import {
  catalogKeys,
  catalogMembershipQueryOptions,
  catalogMemberMutationOptions,
  catalogsInfiniteQueryOptions,
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
