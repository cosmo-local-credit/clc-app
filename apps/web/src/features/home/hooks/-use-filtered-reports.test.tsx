import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type {
  FilteredReportPage,
  ReportCursor,
  ReportSummary,
} from "@clc/api/features/reports/client";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { FilteredReportsTooLargeError, useReportFeed } from "./use-filtered-reports";

const getFilteredReports = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/reports/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/api/features/reports/client")>();
  return { ...actual, getFilteredReports };
});

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api/reports", async () => ({
  reportsClient: await import("@clc/api/features/reports/client"),
}));

function report(id: number): ReportSummary {
  return {
    id: String(id),
    title: `Report ${id}`,
    description: "",
    imageUrl: null,
    locationName: null,
    lat: null,
    lng: null,
    periodFrom: null,
    periodTo: null,
    createdAt: null,
    updatedAt: `2026-07-${String((id % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    tags: [],
    vouchers: [],
    pools: [],
  };
}

function page(ids: number[], next: ReportCursor | null): FilteredReportPage {
  return {
    reports: ids.map(report),
    next,
    tagFacets: null,
    voucherFacets: null,
    poolFacets: null,
  };
}

function cursor(id: number): ReportCursor {
  return { updatedAt: report(id).updatedAt ?? "", id: String(id) };
}

function unfilteredStub(overrides: Partial<Parameters<typeof useReportFeed>[1]> = {}) {
  return {
    reports: [] as ReportSummary[],
    isPending: false,
    error: null as Error | null,
    retry: vi.fn(),
    retrying: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...overrides,
  };
}

function controls(overrides: Partial<CatalogFilterControls> = {}): CatalogFilterControls {
  const filter: CatalogFilter = {
    term: "harvest",
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
    pools: [],
    poolMatch: "any",
  };
  return {
    term: "harvest",
    setTerm: vi.fn(),
    isDebouncing: false,
    result: { ok: true, filter },
    filter,
    isFiltered: true,
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
    pools: [],
    poolMatch: "any",
    toggleTag: vi.fn(),
    setTags: vi.fn(),
    setTagMatch: vi.fn(),
    setFacets: vi.fn(),
    setResourceFacets: vi.fn(),
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

const BOOTSTRAP_FACETS = [{ tag: "Harvest", count: 9 }];

function mockWalk(...pages: FilteredReportPage[]) {
  const queue = [...pages];
  getFilteredReports.mockImplementation((params: { perPage: number }) => {
    if (params.perPage === 1) {
      return Promise.resolve({ ...page([], null), tagFacets: BOOTSTRAP_FACETS });
    }
    const next = queue.shift();
    if (!next) return Promise.reject(new Error("the walk requested more pages than were mocked"));
    return Promise.resolve(next);
  });
}

function walkCalls() {
  return getFilteredReports.mock.calls.filter(([params]) => params.perPage !== 1);
}

beforeEach(() => {
  getFilteredReports.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("filtered report walk", () => {
  it("resolves the whole set in one shot, deduplicated by id", async () => {
    mockWalk(page([5, 4], cursor(4)), page([4, 3], cursor(3)), page([2], null));

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(3);
    expect(result.current.reports.map((row) => row.id)).toEqual(["5", "4", "3", "2"]);
  });

  it("asks for facets on the first request only", async () => {
    mockWalk(page([5], cursor(5)), page([4], null));

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls().map(([params]) => params.facets)).toEqual([true, false]);
  });

  it("takes the facets from the first page, not the last", async () => {
    mockWalk(
      {
        ...page([5], cursor(5)),
        tagFacets: [{ tag: "Harvest", count: 2 }],
        voucherFacets: [
          {
            chainId: 42220,
            address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Sarafu",
            symbol: "SRF",
            count: 3,
          },
        ],
      },
      {
        ...page([4], null),
        tagFacets: [{ tag: "Ignored", count: 99 }],
        voucherFacets: [
          {
            chainId: 42220,
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            name: "Ignored",
            symbol: "NO",
            count: 99,
          },
        ],
      },
    );

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tagFacets).toEqual([{ tag: "Harvest", count: 2 }]);
    expect(result.current.voucherFacets).toEqual([
      expect.objectContaining({ name: "Sarafu", count: 3 }),
    ]);
  });

  it("sends the filter and the paired cursor on later pages", async () => {
    mockWalk(page([5], cursor(5)), page([4], null));

    const filter: CatalogFilter = {
      term: "harvest",
      tags: ["Harvest", "Water"],
      tagMatch: "all",
      vouchers: [
        { chainId: 1, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { chainId: 42220, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      ],
      voucherMatch: "all",
    };
    const { result } = renderHook(
      () =>
        useReportFeed(controls({ filter, result: { ok: true, filter } }), unfilteredStub(), true),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const calls = walkCalls().map(([params]) => params);
    expect(calls[0]).toMatchObject({ filter, cursor: undefined });
    expect(calls[1]).toMatchObject({ filter, cursor: cursor(5) });
  });

  it("asks for the endpoint maximum, not the feed's screenful", async () => {
    mockWalk(page([5], null));

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls().map(([params]) => params.perPage)).toEqual([100]);
  });

  it("terminates on an absent next cursor even on a full page", async () => {
    mockWalk(
      page(
        Array.from({ length: 100 }, (_, index) => 100 - index),
        null,
      ),
    );

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(1);
    expect(result.current.reports).toHaveLength(100);
  });

  it("resolves the widest tag the chip row offers", async () => {
    const WIDEST_TAG_ROWS = 746;
    let issued = 0;
    getFilteredReports.mockImplementation(({ perPage }: { perPage: number }) => {
      if (perPage === 1) return Promise.resolve(page([], null));
      const start = issued * perPage;
      const size = Math.min(perPage, WIDEST_TAG_ROWS - start);
      issued += 1;
      const ids = Array.from({ length: size }, (_, index) => WIDEST_TAG_ROWS - start - index);
      return Promise.resolve(
        page(ids, start + size < WIDEST_TAG_ROWS ? cursor(ids[size - 1]) : null),
      );
    });

    const filter: CatalogFilter = {
      term: "",
      tags: ["Regenerative Agriculture"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
    };
    const { result } = renderHook(
      () =>
        useReportFeed(
          controls({ term: "", filter, result: { ok: true, filter } }),
          unfilteredStub(),
          true,
        ),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"), { timeout: 5000 });
    expect(result.current.error).toBeNull();
    expect(result.current.reports).toHaveLength(WIDEST_TAG_ROWS);
    expect(walkCalls()).toHaveLength(8);
  });

  it("terminates on a repeated cursor pair", async () => {
    mockWalk(page([5], cursor(5)), page([4], cursor(5)));

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(walkCalls()).toHaveLength(2);
    expect(result.current.reports.map((row) => row.id)).toEqual(["5", "4"]);
  });

  it("fails rather than truncating at the page cap, and does not retry", async () => {
    let issued = 0;
    getFilteredReports.mockImplementation(({ perPage }: { perPage: number }) => {
      if (perPage === 1) return Promise.resolve(page([], null));
      issued += 1;
      return Promise.resolve(page([issued], cursor(issued)));
    });

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(FilteredReportsTooLargeError);
    expect(result.current.reports).toEqual([]);
    expect(walkCalls()).toHaveLength(30);
  });

  it("passes one abort signal through the whole walk", async () => {
    mockWalk(page([5], cursor(5)), page([4], null));

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const signals = walkCalls().map(([, signal]) => signal);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });

  it("does not retry a 4xx", async () => {
    getFilteredReports.mockImplementation(({ perPage }: { perPage: number }) =>
      perPage === 1
        ? Promise.resolve(page([], null))
        : Promise.reject(new BackendApiError(400, "invalid filters", "E04")),
    );

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(walkCalls()).toHaveLength(1);
  });

  it("retries a 5xx once", async () => {
    let attempts = 0;
    getFilteredReports.mockImplementation(({ perPage }: { perPage: number }) => {
      if (perPage === 1) return Promise.resolve(page([], null));
      attempts += 1;
      if (attempts === 1) return Promise.reject(new BackendApiError(503, "unavailable"));
      return Promise.resolve(page([5], null));
    });

    const { result } = renderHook(() => useReportFeed(controls(), unfilteredStub(), true), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.reports.map((row) => row.id)).toEqual(["5"]);
  });
});

describe("report feed source selection", () => {
  it("reads the unfiltered feed and issues no filtered request when unfiltered", async () => {
    const unfiltered = unfilteredStub({ reports: [report(1)], hasNextPage: true });
    const { result } = renderHook(
      () =>
        useReportFeed(controls({ isFiltered: false, filter: null, term: "" }), unfiltered, true),
      { wrapper: wrapper(newClient()) },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.reports).toEqual([report(1)]);
    expect(walkCalls()).toHaveLength(0);
    expect(result.current.hasMore).toBe(true);
  });

  it("keeps the unfiltered feed's own load-more wiring", async () => {
    const unfiltered = unfilteredStub({ hasNextPage: true, isFetchingNextPage: true });
    const { result } = renderHook(
      () =>
        useReportFeed(controls({ isFiltered: false, filter: null, term: "" }), unfiltered, true),
      { wrapper: wrapper(newClient()) },
    );

    result.current.loadMore();
    expect(unfiltered.fetchNextPage).toHaveBeenCalledOnce();
    expect(result.current.isLoadingMore).toBe(true);
  });

  it("reports no further pages when filtered, because the walk is exhaustive", async () => {
    mockWalk(page([5], null));

    const { result } = renderHook(
      () => useReportFeed(controls(), unfilteredStub({ hasNextPage: true }), true),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.hasMore).toBe(false);
  });

  it("issues no request and reports no reports for an over-limit filter", async () => {
    const { result } = renderHook(
      () =>
        useReportFeed(
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

    expect(result.current.reports).toEqual([]);
    expect(walkCalls()).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("ready");
  });

  it("keeps a selected tag the vocabulary no longer offers", async () => {
    mockWalk({ ...page([5], null), tagFacets: [{ tag: "Harvest", count: 2 }] });

    const filter: CatalogFilter = {
      term: "",
      tags: ["Retired"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
    };
    const { result } = renderHook(
      () =>
        useReportFeed(
          controls({ filter, result: { ok: true, filter }, tags: ["Retired"] }),
          unfilteredStub(),
          true,
        ),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tagFacets).toEqual([
      { tag: "Harvest", count: 2 },
      { tag: "Retired", count: 0 },
    ]);
  });

  it("puts a compact selected-voucher placeholder after named facets", async () => {
    mockWalk({
      ...page([5], null),
      voucherFacets: [
        {
          chainId: 42220,
          address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          name: "Zulu Credit",
          symbol: "ZULU",
          count: 2,
        },
      ],
    });
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
        useReportFeed(
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

  it("reports refining while a keystroke is pending, holding the previous reports", async () => {
    mockWalk(page([5], null));

    const { result } = renderHook(
      () => useReportFeed(controls({ isDebouncing: true }), unfilteredStub(), true),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.reports).toHaveLength(1));
    expect(result.current.status).toBe("refining");
  });

  it("offers the vocabulary as chips before any filter narrows it", async () => {
    getFilteredReports.mockImplementation(({ perPage }: { perPage: number }) =>
      perPage === 1
        ? Promise.resolve({ ...page([], null), tagFacets: BOOTSTRAP_FACETS })
        : Promise.reject(new Error("no walk expected")),
    );

    const { result } = renderHook(
      () =>
        useReportFeed(
          controls({ isFiltered: false, filter: null, term: "" }),
          unfilteredStub(),
          true,
        ),
      { wrapper: wrapper(newClient()) },
    );

    await waitFor(() => expect(result.current.tagFacets).toEqual(BOOTSTRAP_FACETS));
  });

  it("does not request the facet vocabulary until the filter sheet has been opened", async () => {
    getFilteredReports.mockImplementation(({ perPage }: { perPage: number }) =>
      perPage === 1
        ? Promise.resolve({ ...page([], null), tagFacets: BOOTSTRAP_FACETS })
        : Promise.reject(new Error("no walk expected")),
    );

    const { rerender, result } = renderHook(
      ({ vocabularyEnabled }: { vocabularyEnabled: boolean }) =>
        useReportFeed(
          controls({ isFiltered: false, filter: null, term: "" }),
          unfilteredStub(),
          vocabularyEnabled,
        ),
      { wrapper: wrapper(newClient()), initialProps: { vocabularyEnabled: false } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getFilteredReports).not.toHaveBeenCalled();

    rerender({ vocabularyEnabled: true });

    await waitFor(() => expect(result.current.tagFacets).toEqual(BOOTSTRAP_FACETS));
  });
});
