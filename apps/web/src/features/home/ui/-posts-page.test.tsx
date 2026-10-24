import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { ReportSummary, ReportVoucherFacet } from "@clc/api/features/reports/client";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xabc0000000000000000000000000000000000123",
}));

const POSTS_FILTER_KEY = ownerScopedKey(
  "0xabc0000000000000000000000000000000000123",
  CATALOG_FILTER_PREFERENCE_NAMES.posts,
);

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  vocabulary: undefined as { tag: string; count: number }[] | undefined,
  voucherVocabulary: undefined as ReportVoucherFacet[] | undefined,
  voucherResults: [] as { chainId: number; address: string; name: string; symbol: string }[],
  voucherSearchStatus: "idle" as "idle" | "searching" | "ready" | "error",
  voucherSearchQuery: "",
  setVoucherQuery: vi.fn(),
  retryVoucherSearch: vi.fn(),
  poolResults: [] as { chainId: number; address: string; name: string; symbol: string }[],
  poolSearchStatus: "idle" as "idle" | "searching" | "ready" | "error",
  retryPoolSearch: vi.fn(),
  filteredFilters: [] as (CatalogFilter | null)[],
  filtered: {
    data: undefined as { reports: ReportSummary[]; tagFacets: null } | undefined,
    error: null as Error | null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  },
  feed: {
    data: undefined as { pages: { reports: ReportSummary[] }[] } | undefined,
    isPending: false,
    error: null as Error | null,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock("#/features/home/hooks/use-reports", () => ({
  useReportsInfinite: (_perPage: unknown, enabled = true) =>
    enabled ? mocks.feed : { ...mocks.feed, data: undefined },
}));

vi.mock("#/features/home/hooks/use-filtered-reports", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/features/home/hooks/use-filtered-reports")>();
  return {
    ...actual,
    useReportFeed: (
      filter: CatalogFilterControls,
      unfiltered: {
        reports: ReportSummary[];
        isPending: boolean;
        error: Error | null;
        retry: () => void;
        hasNextPage: boolean;
        fetchNextPage: () => void;
        isFetchingNextPage: boolean;
      },
    ) => {
      mocks.filteredFilters.push(filter.isFiltered ? filter.filter : null);

      const selected = filter.result.ok ? filter.result.filter.tags : [];
      const source = mocks.filtered.data?.tagFacets ?? mocks.vocabulary ?? [];
      const missing = selected.filter((tag) => !source.some((facet) => facet.tag === tag));
      const tagFacets = [...source, ...missing.map((tag) => ({ tag, count: 0 }))].sort(
        (left, right) => left.tag.localeCompare(right.tag),
      );
      const voucherFacets = mocks.voucherVocabulary ?? [];

      if (!filter.isFiltered) {
        return {
          reports: unfiltered.reports,
          status: unfiltered.error ? "error" : unfiltered.isPending ? "loading" : "ready",
          error: unfiltered.error,
          retry: unfiltered.retry,
          tagFacets,
          voucherFacets,
          poolFacets: [],
          hasMore: unfiltered.hasNextPage,
          loadMore: unfiltered.fetchNextPage,
          isLoadingMore: unfiltered.isFetchingNextPage,
        };
      }

      const status = mocks.filtered.error
        ? "error"
        : !filter.result.ok
          ? "ready"
          : mocks.filtered.data === undefined
            ? "loading"
            : filter.isDebouncing || mocks.filtered.isPlaceholderData
              ? "refining"
              : "ready";

      return {
        reports: mocks.filtered.data?.reports ?? [],
        status,
        error: mocks.filtered.error,
        retry: mocks.filtered.refetch,
        tagFacets,
        voucherFacets,
        poolFacets: [],
        hasMore: false,
        loadMore: () => {},
        isLoadingMore: false,
      };
    },
  };
});

vi.mock("#/features/home/hooks/use-voucher-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/home/hooks/use-voucher-search")>();
  return {
    ...actual,
    useVoucherSearch: (query: string, setQuery: (next: string) => void) => {
      mocks.voucherSearchQuery = query;
      return {
        query,
        setQuery: (next: string) => {
          mocks.setVoucherQuery(next);
          setQuery(next);
        },
        results: mocks.voucherResults,
        status: mocks.voucherSearchStatus,
        retry: mocks.retryVoucherSearch,
      };
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    return (
      <a href={path} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("#/features/catalogs/hooks/use-pool-search", () => ({
  POOL_SEARCH_MIN_CHARS: 2,
  usePoolSearch: (query: string, setQuery: (next: string) => void) => ({
    query,
    setQuery,
    results: mocks.poolResults,
    status: mocks.poolSearchStatus,
    retry: mocks.retryPoolSearch,
    retrying: false,
  }),
}));

import { PostsPage } from "./posts-page";

function report(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    id: "3182",
    title: "Harvesting greengrams with Wendo group",
    description: "7 members from Wendo group helped Patricia Makau harvest greengrams.",
    imageUrl: "https://content.example/harvest.jpg",
    locationName: "Kitui, KEN",
    lat: -1.29,
    lng: 36.82,
    periodFrom: "2026-07-01T00:00:00Z",
    periodTo: "2026-07-02T00:00:00Z",
    createdAt: "2026-07-03T08:00:00Z",
    updatedAt: "2026-07-19T08:14:02.311Z",
    tags: ["Food production"],
    vouchers: [
      {
        id: "22",
        chainId: 42220,
        address: "0x2222222222222222222222222222222222222222",
        name: "Kiriba",
        symbol: "KCH",
      },
    ],
    pools: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.feed = {
    data: { pages: [{ reports: [report()] }] },
    isPending: false,
    error: null,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
  mocks.search = {};
  mocks.navigate = vi.fn();
  mocks.vocabulary = undefined;
  mocks.voucherVocabulary = undefined;
  mocks.voucherResults = [];
  mocks.voucherSearchStatus = "idle";
  mocks.voucherSearchQuery = "";
  mocks.setVoucherQuery = vi.fn();
  mocks.retryVoucherSearch = vi.fn();
  mocks.poolResults = [];
  mocks.poolSearchStatus = "idle";
  mocks.retryPoolSearch = vi.fn();
  mocks.filteredFilters = [];
  mocks.filtered = {
    data: undefined,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
});

/**
 * The report feed, scoped away from the header.
 *
 * The header carries New post and My posts links of its own, so a bare
 * `getByRole("link")` no longer names the row.
 */
function feed() {
  return screen.getByRole("region", { name: "Field reports" });
}

describe("PostsPage", () => {
  it("renders a report as a list row linking to its own page", () => {
    render(<PostsPage />);

    expect(screen.getByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(
      screen.queryByText("Field reports from pools, service providers, and stewards."),
    ).toBeNull();
    const filters = screen.getByRole("button", { name: "Filters" });
    const search = screen.getByRole("searchbox", {
      name: "Search posts by title or description",
    });
    const searchControl = search.closest('[data-slot="market-search-control"]');
    expect(filters.className).toContain("size-11");
    expect(filters.textContent).toBe("");
    expect(searchControl?.contains(filters)).toBe(true);
    expect(searchControl?.className).toContain("h-11");
    const row = within(feed()).getByRole("link");
    expect(row.getAttribute("href")).toBe("/posts/3182");
    expect(within(row).getByText("Harvesting greengrams with Wendo group")).toBeTruthy();
    // No summary line: a post written in this app has no description, so the
    // row is title, tags, date and voucher symbols.
    expect(within(row).queryByText(/7 members from Wendo group/)).toBeNull();
    expect(within(row).getByText("Food production")).toBeTruthy();
    expect(within(row).getByText("KCH")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Field reports" }).className).not.toMatch(/rounded-/);
    expect(screen.queryByText(/impact reports/i)).toBeNull();
  });

  it("shows the updated date instead of the author address", () => {
    render(<PostsPage />);

    const row = within(feed()).getByRole("link");
    const time = row.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-07-19T08:14:02.311Z");
    expect(time?.textContent).toContain("2026");
    expect(row.textContent).not.toContain("0x1111");
    expect(screen.queryByText(/Jul 3, 2026/)).toBeNull();
  });

  it("limits the title to one line", () => {
    render(<PostsPage />);

    expect(screen.getByText("Harvesting greengrams with Wendo group").className).toContain(
      "line-clamp-1",
    );
  });

  it("contains long tag labels and vertically aligns the date metadata", () => {
    mocks.feed.data = {
      pages: [{ reports: [report({ tags: ["Common Space", "Construction", "Care"] })] }],
    };
    render(<PostsPage />);

    const tagLabel = screen.getByText("Common Space");
    expect(tagLabel.className).toContain("block");
    expect(tagLabel.className).toContain("truncate");
    expect(tagLabel.parentElement?.className).toContain("overflow-hidden");

    const time = within(feed()).getByRole("link").querySelector("time");
    const metadataRow = time?.parentElement;
    const voucher = screen.getByText("KCH");
    expect(metadataRow?.className).toContain("h-5");
    expect(time?.className).toContain("h-full");
    expect(time?.className).toContain("items-center");
    expect(time?.className).toContain("text-xs");
    expect(voucher.parentElement?.className).toContain("h-full");
    // The small Badge is the row's own 20px, so it centres beside the date.
    expect(voucher.className).toContain("h-5");
  });

  it("lazy-loads the main image so a page of rows costs no bytes up front", () => {
    const { container } = render(<PostsPage />);

    const image = container.querySelector('img[src="https://content.example/harvest.jpg"]');
    expect(image?.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to a seeded monogram when a report has no image", () => {
    mocks.feed.data = { pages: [{ reports: [report({ imageUrl: null })] }] };
    const { container } = render(<PostsPage />);

    expect(container.querySelector("img")).toBeNull();
    expect(within(feed()).getByRole("link").textContent).toContain("H");
  });

  it("caps tags and vouchers so a row cannot grow unbounded", () => {
    mocks.feed.data = {
      pages: [
        {
          reports: [
            report({
              tags: ["Education", "Care", "Culture", "Art"],
              vouchers: [
                { id: "1", chainId: 42220, address: "0x1", name: "One", symbol: "ONE" },
                { id: "2", chainId: 42220, address: "0x2", name: "Two", symbol: "TWO" },
                { id: "3", chainId: 42220, address: "0x3", name: "Three", symbol: "THREE" },
              ],
            }),
          ],
        },
      ],
    };
    render(<PostsPage />);

    const row = within(feed()).getByRole("link");
    expect(within(row).getByText("Education")).toBeTruthy();
    expect(within(row).getByText("Care")).toBeTruthy();
    expect(within(row).queryByText("Culture")).toBeNull();
    expect(within(row).getByText("+2")).toBeTruthy();
    const voucher = within(row).getByText("ONE");
    expect(voucher.className).toContain("border-border");
    expect(voucher.className).toContain("bg-card");
    expect(within(row).queryByText("TWO")).toBeNull();
    expect(within(row).queryByText("THREE")).toBeNull();
    expect(within(row).getByText("2+")).toBeTruthy();
  });

  it("offers a retry when the feed fails", () => {
    const refetch = vi.fn();
    mocks.feed = {
      ...mocks.feed,
      data: undefined,
      error: new Error("network down"),
      isError: true,
      isSuccess: false,
      refetch,
    };
    render(<PostsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows an empty state rather than an error when there are no posts", () => {
    mocks.feed.data = { pages: [{ reports: [] }] };
    render(<PostsPage />);

    expect(screen.getByText("No posts yet.")).toBeTruthy();
    // The header's own actions stay: an empty feed is exactly when an author
    // needs somewhere to write.
    expect(screen.queryByRole("region", { name: "Field reports" })).toBeNull();
    expect(screen.getByRole("link", { name: "New post" }).getAttribute("href")).toBe("/posts/new");
    expect(screen.getByRole("link", { name: "My posts" }).getAttribute("href")).toBe("/posts/mine");
  });
});

describe("PostsPage filtering", () => {
  const VOCABULARY = [
    { tag: "Harvest", count: 4 },
    { tag: "Training", count: 1 },
    { tag: "Water", count: 0 },
  ];
  // Search results, not facets: /api/v2/vouchers carries no per-voucher match count.
  const VOUCHER_RESULTS = [
    {
      chainId: 1,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "Alpha Credit",
      symbol: "ALPHA",
    },
    {
      chainId: 42220,
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      name: "Beta Credit",
      symbol: "BETA",
    },
  ];

  function openFilters() {
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    return screen.getByRole("dialog", { name: "Filter posts" });
  }

  it("says what is actually searched, and no more", () => {
    render(<PostsPage />);

    expect(screen.getByLabelText("Search posts by title or description")).toBeTruthy();
  });

  it("keeps the first character and issues no request for it", () => {
    render(<PostsPage />);

    const input = screen.getByLabelText("Search posts by title or description") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "h" } });

    expect(input.value).toBe("h");
    expect(mocks.filteredFilters.every((filter) => filter === null)).toBe(true);
  });

  it("keeps the vocabulary in the filter sheet", () => {
    mocks.vocabulary = VOCABULARY;
    render(<PostsPage />);

    expect(screen.queryByRole("group", { name: "Filter by tag" })).toBeNull();
    const sheet = openFilters();
    expect(sheet.className).toContain("rounded-none");
    expect(within(sheet).getByRole("heading", { name: "Filter posts" }).className).toContain(
      "sr-only",
    );
    expect(within(sheet).getByRole("button", { name: "Close filters" }).className).toContain(
      "sr-only",
    );
    const filterContent = sheet.querySelector<HTMLElement>(".overflow-y-auto");
    expect(filterContent?.className).toContain("border-b");
    expect(filterContent?.className).not.toContain("border-y");
    const row = within(sheet).getByRole("group", { name: "Filter by tag" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Harvest4", "Training1", "Water0"]);
  });

  it("disables an unselected zero-count chip but never a selected one", () => {
    mocks.search = { tags: "Water" };
    mocks.vocabulary = VOCABULARY;
    render(<PostsPage />);

    const sheet = openFilters();
    const selected = within(sheet).getByRole("button", { name: /Water/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.hasAttribute("disabled")).toBe(false);
    expect(
      within(sheet)
        .getByRole("button", { name: /Training/ })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("stages a tag until Apply, then pushes once and remembers it", () => {
    mocks.vocabulary = VOCABULARY;
    render(<PostsPage />);

    const sheet = openFilters();
    fireEvent.click(within(sheet).getByRole("button", { name: /Harvest/ }));
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));
    const call = mocks.navigate.mock.calls.at(-1)?.[0];
    expect(call?.replace).toBeUndefined();
    const search = call?.search as (previous: Record<string, unknown>) => Record<string, unknown>;
    expect(search({})).toMatchObject({ tags: "Harvest" });
    expect(JSON.parse(window.localStorage.getItem(POSTS_FILTER_KEY) ?? "null")).toEqual({
      tags: ["Harvest"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
      pools: [],
      poolMatch: "any",
    });
  });

  it("applies voucher relationships with all-match in one canonical navigation", () => {
    mocks.voucherResults = VOUCHER_RESULTS;
    mocks.voucherSearchStatus = "ready";
    render(<PostsPage />);

    const sheet = openFilters();
    const vouchers = within(sheet).getByRole("listbox", { name: "Voucher search results" });
    fireEvent.click(within(vouchers).getByRole("option", { name: /Alpha Credit/ }));
    fireEvent.click(within(vouchers).getByRole("option", { name: /Beta Credit/ }));
    const matchHeading = within(sheet).getByRole("heading", {
      name: "How should vouchers match?",
    });
    expect(matchHeading.parentElement?.tagName).toBe("SECTION");
    fireEvent.click(within(sheet).getByRole("button", { name: "All selected" }));
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const call = mocks.navigate.mock.calls[0]?.[0];
    const search = call?.search as (previous: Record<string, unknown>) => Record<string, unknown>;
    expect(search({})).toMatchObject({
      vouchers:
        "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,42220:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      voucherMatch: "all",
    });
    expect(JSON.parse(window.localStorage.getItem(POSTS_FILTER_KEY) ?? "null")).toEqual({
      tags: [],
      tagMatch: "any",
      vouchers: [
        "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "42220:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      voucherMatch: "all",
      pools: [],
      poolMatch: "any",
    });
  });

  it("applies pool relationships with all-match and keeps search result labels", () => {
    mocks.poolResults = [
      {
        chainId: 100,
        address: "0x1111111111111111111111111111111111111111",
        name: "Kilifi Pool",
        symbol: "KLF",
      },
      {
        chainId: 100,
        address: "0x2222222222222222222222222222222222222222",
        name: "Coast Pool",
        symbol: "CST",
      },
    ];
    mocks.poolSearchStatus = "ready";
    render(<PostsPage />);

    const sheet = openFilters();
    const pools = within(sheet).getByRole("listbox", { name: "Pool search results" });
    fireEvent.click(within(pools).getByRole("option", { name: /Kilifi Pool/ }));
    fireEvent.click(within(pools).getByRole("option", { name: /Coast Pool/ }));
    expect(within(sheet).getByRole("button", { name: "Remove Kilifi Pool" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Remove Coast Pool" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "All selected" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const call = mocks.navigate.mock.calls[0]?.[0];
    const search = call?.search as (previous: Record<string, unknown>) => Record<string, unknown>;
    expect(search({})).toMatchObject({
      pools:
        "100:0x1111111111111111111111111111111111111111,100:0x2222222222222222222222222222222222222222",
      poolMatch: "all",
    });
    expect(JSON.parse(window.localStorage.getItem(POSTS_FILTER_KEY) ?? "null")).toMatchObject({
      pools: [
        "100:0x1111111111111111111111111111111111111111",
        "100:0x2222222222222222222222222222222222222222",
      ],
      poolMatch: "all",
    });
  });

  it("resets staged pool selections with the shared Reset action", () => {
    mocks.poolResults = [
      {
        chainId: 100,
        address: "0x1111111111111111111111111111111111111111",
        name: "Kilifi Pool",
        symbol: "KLF",
      },
    ];
    mocks.poolSearchStatus = "ready";
    render(<PostsPage />);

    const sheet = openFilters();
    const pools = within(sheet).getByRole("listbox", { name: "Pool search results" });
    fireEvent.click(within(pools).getByRole("option", { name: /Kilifi Pool/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Reset" }));

    expect(within(sheet).queryByRole("button", { name: "Remove Kilifi Pool" })).toBeNull();
  });

  it("keeps the selected chips keyboard-operable from the voucher input", () => {
    mocks.voucherResults = VOUCHER_RESULTS;
    mocks.voucherSearchStatus = "ready";
    render(<PostsPage />);

    const sheet = openFilters();
    const vouchers = within(sheet).getByRole("listbox", { name: "Voucher search results" });
    fireEvent.click(within(vouchers).getByRole("option", { name: /Alpha Credit/ }));

    // Base UI wires arrow/Backspace chip navigation through the chips context, which the input
    // only sees when it is rendered inside Combobox.Chips.
    const chips = within(sheet).getByRole("toolbar", { name: "Selected vouchers" });
    expect(within(chips).getByRole("combobox", { name: "Search voucher filters" })).toBeTruthy();

    const input = within(chips).getByRole("combobox", { name: "Search voucher filters" });
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });

    // Arrow-left off an empty input moves focus onto the last chip, which is what makes the
    // selection removable without a pointer.
    const chip = within(chips).getByRole("button", { name: "Remove Alpha Credit" }).parentElement;
    expect(document.activeElement).toBe(chip);
  });

  it("keeps the voucher input keyboard-operable at the selection limit", () => {
    const selected: ReportVoucherFacet[] = Array.from({ length: 10 }, (_, index) => ({
      chainId: 42220,
      address: `0x${(index + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
      name: `Voucher ${index + 1}`,
      symbol: `V${index + 1}`,
      count: 1,
    }));
    mocks.search = {
      vouchers: selected.map(({ chainId, address }) => `${chainId}:${address}`).join(","),
    };
    mocks.voucherVocabulary = selected;
    render(<PostsPage />);

    const sheet = openFilters();
    const input = within(sheet).getByRole("combobox", {
      name: "Search voucher filters",
    }) as HTMLInputElement;

    expect(input.disabled).toBe(false);
    expect(
      within(sheet).getByText("Limit of 10 vouchers reached. Remove one to add another."),
    ).toBeTruthy();

    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(document.activeElement).not.toBe(input);
  });

  it("lists nothing until the query is worth a request", () => {
    render(<PostsPage />);

    const sheet = openFilters();
    expect(within(sheet).getByRole("combobox", { name: "Search voucher filters" })).toBeTruthy();
    expect(within(sheet).getByText("Type at least 2 characters to search vouchers.")).toBeTruthy();
    // Nothing preloaded means no listbox competing for sheet height.
    expect(within(sheet).queryByRole("listbox", { name: "Voucher search results" })).toBeNull();
    expect(within(sheet).queryByText("No vouchers match this search.")).toBeNull();
  });

  it("stays quiet about empty results while the search is still running", () => {
    mocks.voucherSearchStatus = "searching";
    render(<PostsPage />);

    const sheet = openFilters();
    expect(within(sheet).getByText("Searching vouchers…")).toBeTruthy();
    expect(within(sheet).queryByText("No vouchers match this search.")).toBeNull();
  });

  it("says so when a finished search matched nothing", () => {
    mocks.voucherSearchStatus = "ready";
    render(<PostsPage />);

    const sheet = openFilters();
    // Matched loosely: Base UI appends a word joiner to the live region so screen readers
    // re-announce an unchanged message.
    expect(within(sheet).getByText(/No vouchers match this search\./)).toBeTruthy();
  });

  it("offers a retry when the voucher search fails", () => {
    mocks.voucherSearchStatus = "error";
    render(<PostsPage />);

    const sheet = openFilters();
    expect(within(sheet).getByText("Couldn't search vouchers.")).toBeTruthy();
    expect(within(sheet).queryByText("No vouchers match this search.")).toBeNull();

    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(mocks.retryVoucherSearch).toHaveBeenCalledTimes(1);
  });

  it("clears the query after a pick so the list collapses for the next search", () => {
    mocks.voucherResults = VOUCHER_RESULTS;
    mocks.voucherSearchStatus = "ready";
    render(<PostsPage />);

    const sheet = openFilters();
    const vouchers = within(sheet).getByRole("listbox", { name: "Voucher search results" });
    fireEvent.click(within(vouchers).getByRole("option", { name: /Alpha Credit/ }));

    expect(mocks.setVoucherQuery).toHaveBeenCalledWith("");
    // The chip keeps the name the search supplied, so it survives the results disappearing.
    const chips = within(sheet).getByRole("toolbar", { name: "Selected vouchers" });
    expect(within(chips).getByText("Alpha Credit")).toBeTruthy();
  });

  it("hides counts under All tags, where they cannot mean what they look like", () => {
    mocks.vocabulary = VOCABULARY;
    mocks.search = { tags: "Harvest,Training", tagMatch: "all" };
    render(<PostsPage />);

    const row = within(openFilters()).getByRole("group", { name: "Filter by tag" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Harvest", "Training", "Water"]);
  });

  it("distinguishes filtered-empty from an empty feed", () => {
    mocks.search = { q: "zzzz" };
    mocks.filtered = { ...mocks.filtered, data: { reports: [], tagFacets: null } };
    window.localStorage.setItem(
      POSTS_FILTER_KEY,
      JSON.stringify({ tags: ["Harvest"], tagMatch: "any" }),
    );
    render(<PostsPage />);

    expect(screen.getByText("No posts match this search.")).toBeTruthy();
    expect(screen.queryByText("No posts yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(window.localStorage.getItem(POSTS_FILTER_KEY)).toBeNull();
  });

  it("says nothing about matches while a cold filtered load is pending", () => {
    mocks.search = { q: "harvest" };
    mocks.filtered = { ...mocks.filtered, data: undefined };
    render(<PostsPage />);

    expect(screen.queryByText("No posts match this search.")).toBeNull();
    expect(screen.queryByText("No posts yet.")).toBeNull();
    expect(screen.getByText("Loading posts…")).toBeTruthy();
  });

  it("holds the previous rows while a new filter resolves", () => {
    mocks.search = { q: "harvest" };
    mocks.filtered = {
      ...mocks.filtered,
      data: { reports: [report()], tagFacets: null },
      isPlaceholderData: true,
    };
    render(<PostsPage />);

    const list = screen.getByRole("region", { name: "Field reports" });
    expect(list.getAttribute("aria-busy")).toBe("true");
    expect(within(list).getAllByRole("link")).toHaveLength(1);
  });

  it("hides the chip row on an over-limit link and offers a way out", () => {
    mocks.search = { tags: Array.from({ length: 13 }, (_, index) => `Tag${index}`) };
    mocks.vocabulary = VOCABULARY;
    render(<PostsPage />);

    expect(screen.queryByRole("group", { name: "Filter by tag" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("too many filters");
    expect(mocks.filteredFilters.every((filter) => filter === null)).toBe(true);
  });

  it("does not blame the filters for an expired session", () => {
    mocks.search = { q: "harvest" };
    mocks.filtered = { ...mocks.filtered, error: new BackendApiError(401, "unauthorized") };
    render(<PostsPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain("These filters aren't valid.");
    expect(alert.textContent).toContain("Couldn't load posts.");
  });

  it("reports an invalid filter generically, never by matching backend prose", () => {
    mocks.search = { tags: "NotATag" };
    mocks.filtered = {
      ...mocks.filtered,
      error: new BackendApiError(400, "tags contains a value outside the tag vocabulary", "E04"),
    };
    render(<PostsPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("These filters aren't valid.");
    expect(alert.textContent).not.toContain("vocabulary");
  });

  it("offers no action for a rate limit", () => {
    mocks.search = { q: "harvest" };
    mocks.filtered = { ...mocks.filtered, error: new BackendApiError(429, "rate limited") };
    render(<PostsPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Too many searches");
    expect(within(alert).queryByRole("button")).toBeNull();
  });

  it("keeps a selected tag the vocabulary no longer offers", () => {
    mocks.search = { tags: "Retired" };
    mocks.vocabulary = VOCABULARY;
    render(<PostsPage />);

    const chip = within(openFilters()).getByRole("button", { name: /Retired/ });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.hasAttribute("disabled")).toBe(false);
  });
});
