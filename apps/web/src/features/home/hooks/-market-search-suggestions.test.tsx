import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { useMarketSearchSuggestions } from "./use-market-search-suggestions";

const { list, bounds } = vi.hoisted(() => ({
  list: vi.fn(),
  bounds: [{ minLng: -1, minLat: -1, maxLng: 1, maxLat: 1 }] as const,
}));
vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: { list } }));
vi.mock("#/components/nearby-catalog", async (original) => ({
  ...(await original<typeof import("#/components/nearby-catalog")>()),
  useNearbyCatalog: () => ({ nearby: false, scope: "viewport:guest:box", bounds }),
}));

it("walks bounded server pages until both suggestion kinds are represented", async () => {
  list.mockImplementation(async (params) => {
    if (params.facets)
      return {
        results: [],
        tagFacets: [
          { tag: "Repair", count: 2 },
          { tag: "Unused", count: 0 },
        ],
        nextCursor: null,
      };
    return params.cursor
      ? {
          results: [{ kind: "voucher", id: "near", name: "Near", geoLat: 0, geoLng: 0 }],
          nextCursor: null,
        }
      : {
          results: Array.from({ length: 3 }, (_, id) => ({
            kind: "voucher",
            id: String(id),
            name: "Nearby",
            geoLat: 0,
            geoLng: 0,
          })),
          nextCursor: "page2",
        };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMarketSearchSuggestions("repair"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() =>
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ q: "repair" }),
      expect.any(AbortSignal),
    ),
  );
  await waitFor(() =>
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ bounds }), expect.any(AbortSignal)),
  );
  await waitFor(() => expect(result.current.vouchers.map((row) => row.id)).toContain("near"));
  expect(result.current.tags).toEqual(["Repair"]);
});

function mountSuggestions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useMarketSearchSuggestions("repair"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
it("stops automatic paging at its budget and lets the visitor continue", async () => {
  let pages = 0;
  list.mockImplementation(async (params) => {
    if (params.facets) return { results: [], tagFacets: [], nextCursor: null };
    pages++;
    return { results: [], nextCursor: String(pages) };
  });
  const { result } = mountSuggestions();
  await waitFor(() => expect(pages).toBe(6));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.hasMore).toBe(true);
  result.current.loadMore();
  await waitFor(() => expect(pages).toBe(7));
});
it("surfaces a later-page failure and retries that page without losing earlier matches", async () => {
  let fail = true;
  list.mockImplementation(async (params) => {
    if (params.facets) return { results: [], tagFacets: [], nextCursor: null };
    if (!params.cursor)
      return {
        results: [{ kind: "voucher", id: "near", geoLat: 0, geoLng: 0 }],
        nextCursor: "next",
      };
    if (fail) throw new Error("offline");
    return { results: [{ kind: "pool", id: "pool", geoLat: 0, geoLng: 0 }], nextCursor: null };
  });
  const { result } = mountSuggestions();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.vouchers.map((row) => row.id)).toEqual(["near"]);
  fail = false;
  result.current.retry();
  await waitFor(() => expect(result.current.pools.map((row) => row.id)).toEqual(["pool"]));
  expect(result.current.hasMore).toBe(false);
});
