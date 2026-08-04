import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "#/features/auth/api/client";
import type { FilteredPoolPage, UserPool } from "#/features/pools/api/pools-client";
import { FilteredPoolsTooLargeError, usePoolCatalog } from "./use-filtered-pools";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const getFilteredPools = vi.hoisted(() => vi.fn());

vi.mock("#/features/pools/api/pools-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/pools/api/pools-client")>();
  return { ...actual, getFilteredPools };
});

const PER_PAGE = 100;

function pool(id: number): UserPool {
  return {
    id: String(id),
    chainId: 42220,
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Pool ${id}`,
    symbol: `P${id}`,
    ownerAddress: null,
    feePpm: null,
    feeAddress: null,
    tokenRegistryAddress: null,
    limiterAddress: null,
    quoterAddress: null,
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "",
    unitOfAccount: null,
    locationName: null,
    geoLat: null,
    geoLng: null,
    email: null,
    website: null,
    phone: null,
    imageUrl: null,
    bannerUrl: null,
    terms: null,
    defaultVoucherId: null,
    voucherCount: 0,
    tags: [],
  };
}

function page(ids: number[], overrides: Partial<FilteredPoolPage> = {}): FilteredPoolPage {
  return {
    pools: ids.map(pool),
    first: ids[0] ?? 0,
    last: ids.at(-1) ?? 0,
    receivedCount: ids.length,
    tagFacets: null,
    voucherFacets: null,
    ...overrides,
  };
}

function fullPage(startId: number, overrides: Partial<FilteredPoolPage> = {}) {
  return page(
    Array.from({ length: PER_PAGE }, (_, index) => startId - index),
    overrides,
  );
}

function unfilteredStub(overrides: Partial<Parameters<typeof usePoolCatalog>[1]> = {}) {
  return {
    pools: [] as UserPool[],
    isPending: false,
    error: null as Error | null,
    retry: vi.fn(),
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...overrides,
  };
}

function controls(overrides: Partial<CatalogFilterControls> = {}): CatalogFilterControls {
  const filter: CatalogFilter = {
    term: "food",
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
  };
  return {
    term: "food",
    setTerm: vi.fn(),
    isDebouncing: false,
    result: { ok: true, filter },
    filter,
    isFiltered: true,
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
    toggleTag: vi.fn(),
    setTags: vi.fn(),
    setTagMatch: vi.fn(),
    setFacets: vi.fn(),
    isAtTagLimit: false,
    clearTerm: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 0, refetchOnWindowFocus: false } },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const BOOTSTRAP_FACETS = [{ tag: "Food", count: 9 }];

function mockWalk(...pages: FilteredPoolPage[]) {
  const queue = [...pages];
  getFilteredPools.mockImplementation((params: { perPage: number }) => {
    if (params.perPage === 1) {
      return Promise.resolve(page([], { tagFacets: BOOTSTRAP_FACETS }));
    }
    const next = queue.shift();
    if (!next) return Promise.reject(new Error("the walk requested more pages than were mocked"));
    return Promise.resolve(next);
  });
}

function walkCalls() {
  return getFilteredPools.mock.calls.filter(([params]) => params.perPage !== 1);
}

beforeEach(() => {
  getFilteredPools.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("filtered pool walk", () => {
  it("resolves the whole set in one shot, deduplicated by address", async () => {
    mockWalk(fullPage(1000), fullPage(900), page([799, 798]));

    const { result } = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(3);
    expect(result.current.pools).toHaveLength(PER_PAGE * 2 + 2);
  });

  it("asks for facets on the first request only", async () => {
    mockWalk(
      fullPage(1000, {
        tagFacets: [{ tag: "Food", count: 4 }],
        voucherFacets: [
          {
            chainId: 42220,
            address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Sarafu",
            symbol: "SRF",
            count: 3,
          },
        ],
      }),
      page([899]),
    );

    const { result } = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls().map(([params]) => params.facets)).toEqual([true, false]);
    expect(result.current.tagFacets).toEqual([{ tag: "Food", count: 4 }]);
    expect(result.current.voucherFacets).toEqual([
      expect.objectContaining({ name: "Sarafu", count: 3 }),
    ]);
  });

  it("sends the filter and a paired cursor on later pages", async () => {
    mockWalk(fullPage(1000), page([899]));

    const filter: CatalogFilter = {
      term: "food",
      tags: ["Food", "Growing"],
      tagMatch: "all",
      vouchers: [
        { chainId: 1, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { chainId: 42220, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      ],
      voucherMatch: "all",
    };
    const { result } = renderHook(
      () =>
        usePoolCatalog(controls({ filter, result: { ok: true, filter } }), unfilteredStub(), true),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const calls = walkCalls().map(([params]) => params);
    expect(calls[0]).toMatchObject({ filter, cursor: undefined, next: undefined });
    expect(calls[1]).toMatchObject({ filter, cursor: 901, next: true });
  });

  it("terminates on a short page, a zero cursor, and a stalled cursor", async () => {
    mockWalk(page([1000, 999]));
    const short = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(short.result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(1);

    getFilteredPools.mockReset();
    mockWalk(fullPage(1000, { last: 0 }));
    const zero = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(zero.result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(1);

    getFilteredPools.mockReset();
    mockWalk(fullPage(1000), fullPage(1000));
    const stalled = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(stalled.result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(2);
  });

  it("fails rather than truncating at the page cap, and does not retry", async () => {
    getFilteredPools.mockImplementation(
      ({ perPage, cursor }: { perPage: number; cursor?: number }) =>
        perPage === 1
          ? Promise.resolve(page([], { tagFacets: BOOTSTRAP_FACETS }))
          : Promise.resolve(fullPage(cursor === undefined ? 1_000_000 : cursor - 1)),
    );

    const { result } = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(FilteredPoolsTooLargeError);
    expect(result.current.pools).toEqual([]);
    expect(walkCalls()).toHaveLength(10);
  });

  it("passes one abort signal through the whole walk", async () => {
    mockWalk(fullPage(1000), page([899]));

    const { result } = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const signals = walkCalls().map(([, signal]) => signal);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });

  it("does not retry a 4xx", async () => {
    getFilteredPools.mockImplementation(({ perPage }: { perPage: number }) =>
      perPage === 1
        ? Promise.resolve(page([], { tagFacets: BOOTSTRAP_FACETS }))
        : Promise.reject(new BackendApiError(400, "invalid filters", "E04")),
    );

    const { result } = renderHook(() => usePoolCatalog(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(walkCalls()).toHaveLength(1);
  });
});

describe("pool catalog source selection", () => {
  it("reads the unfiltered list and issues no filtered request when unfiltered", async () => {
    const unfiltered = unfilteredStub({ pools: [pool(1)], hasNextPage: true });
    const { result } = renderHook(
      () =>
        usePoolCatalog(controls({ isFiltered: false, filter: null, term: "" }), unfiltered, true),
      { wrapper: wrapper(newClient()) },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.pools).toEqual([pool(1)]);
    expect(walkCalls()).toHaveLength(0);
    expect(result.current.hasMore).toBe(true);
  });

  it("reports no further pages when filtered, because the walk is exhaustive", async () => {
    mockWalk(page([1000]));

    const { result } = renderHook(
      () => usePoolCatalog(controls(), unfilteredStub({ hasNextPage: true }), true),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.hasMore).toBe(false);
  });

  it("issues no request and reports no pools for an over-limit filter", async () => {
    const { result } = renderHook(
      () =>
        usePoolCatalog(
          controls({
            filter: null,
            result: { ok: false, reason: "too-many-tags", requested: 13, max: 12 },
          }),
          unfilteredStub(),
          true,
        ),
      { wrapper: wrapper(newClient()) },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.pools).toEqual([]);
    expect(walkCalls()).toHaveLength(0);
  });

  it("keeps a selected tag the vocabulary no longer offers", async () => {
    mockWalk(page([1000], { tagFacets: [{ tag: "Food", count: 2 }] }));

    const filter: CatalogFilter = {
      term: "",
      tags: ["Retired"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
    };
    const { result } = renderHook(
      () =>
        usePoolCatalog(
          controls({ filter, result: { ok: true, filter }, tags: ["Retired"] }),
          unfilteredStub(),
          true,
        ),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tagFacets).toEqual([
      { tag: "Food", count: 2 },
      { tag: "Retired", count: 0 },
    ]);
  });

  it("puts a compact selected-voucher placeholder after named facets", async () => {
    mockWalk(
      page([1000], {
        voucherFacets: [
          {
            chainId: 42220,
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            name: "Zulu Credit",
            symbol: "ZULU",
            count: 2,
          },
        ],
      }),
    );
    const selected = {
      chainId: 42220,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } as const;
    const filter: CatalogFilter = {
      term: "",
      tags: [],
      tagMatch: "any",
      vouchers: [selected],
      voucherMatch: "any",
    };

    const { result } = renderHook(
      () =>
        usePoolCatalog(
          controls({
            filter,
            result: { ok: true, filter },
            vouchers: [selected],
          }),
          unfilteredStub(),
          true,
        ),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.voucherFacets.map(({ name, symbol }) => ({ name, symbol }))).toEqual([
      { name: "Zulu Credit", symbol: "ZULU" },
      { name: "0xaaaaaa…aaaaaa", symbol: "" },
    ]);
  });

  it("reports refining while a keystroke is pending, holding the previous pools", async () => {
    mockWalk(page([1000]));

    const { result } = renderHook(
      () => usePoolCatalog(controls({ isDebouncing: true }), unfilteredStub(), true),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.pools).toHaveLength(1));
    expect(result.current.status).toBe("refining");
  });

  it("does not request the facet vocabulary until the filter sheet has been opened", async () => {
    getFilteredPools.mockImplementation(({ perPage }: { perPage: number }) =>
      perPage === 1
        ? Promise.resolve(page([], { tagFacets: BOOTSTRAP_FACETS }))
        : Promise.reject(new Error("no walk expected")),
    );

    const { rerender, result } = renderHook(
      ({ vocabularyEnabled }: { vocabularyEnabled: boolean }) =>
        usePoolCatalog(
          controls({ isFiltered: false, filter: null, term: "" }),
          unfilteredStub(),
          vocabularyEnabled,
        ),
      { wrapper: wrapper(newClient()), initialProps: { vocabularyEnabled: false } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getFilteredPools).not.toHaveBeenCalled();

    rerender({ vocabularyEnabled: true });

    await waitFor(() => expect(result.current.tagFacets).toEqual(BOOTSTRAP_FACETS));
  });
});
