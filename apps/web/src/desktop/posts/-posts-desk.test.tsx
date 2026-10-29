import type { ReportSummary } from "@clc/api/features/reports/client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xabc0000000000000000000000000000000000123",
}));

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  reports: [] as ReportSummary[],
  tags: [] as { tag: string; count: number }[],
}));

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

vi.mock("#/features/home/hooks/use-reports", () => ({
  useReportsInfinite: () => ({
    data: { pages: [{ reports: mocks.reports }] },
    isPending: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    isFetching: false,
  }),
}));

// The feed's own query is not under test: it returns what the page was given.
vi.mock("#/features/home/hooks/use-filtered-reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/features/home/hooks/use-filtered-reports")>()),
  useReportFeed: (
    _filter: unknown,
    unfiltered: { reports: ReportSummary[]; retry: () => void },
  ) => ({
    reports: unfiltered.reports,
    status: "ready",
    error: null,
    retry: unfiltered.retry,
    retrying: false,
    tagFacets: mocks.tags,
    voucherFacets: [],
    poolFacets: [],
    hasMore: false,
    loadMore: vi.fn(),
    isLoadingMore: false,
  }),
}));

vi.mock("#/features/home/hooks/use-voucher-search", () => ({
  VOUCHER_SEARCH_MIN_CHARS: 2,
  useVoucherSearch: (query: string, setQuery: (next: string) => void) => ({
    query,
    setQuery,
    results: [],
    status: "idle",
    retry: vi.fn(),
  }),
}));

vi.mock("#/features/catalogs/hooks/use-pool-search", () => ({
  POOL_SEARCH_MIN_CHARS: 2,
  usePoolSearch: (query: string, setQuery: (next: string) => void) => ({
    query,
    setQuery,
    results: [],
    status: "idle",
    retry: vi.fn(),
    retrying: false,
  }),
}));

import { PostsDesk } from "./posts-desk";

function report(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    id: "3182",
    title: "Harvesting greengrams with Wendo group",
    description: "",
    imageUrl: "https://content.example/harvest.jpg",
    locationName: "Kitui, KEN",
    lat: -1.29,
    lng: 36.82,
    periodFrom: "2026-07-01T00:00:00Z",
    periodTo: "2026-07-02T00:00:00Z",
    createdAt: "2026-07-03T08:00:00Z",
    updatedAt: "2026-07-19T08:14:02.311Z",
    markerIcon: "post",
    markerColor: "pink",
    tags: ["Food production", "Training", "Water"],
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
  mocks.search = {};
  mocks.navigate = vi.fn();
  mocks.reports = [
    report(),
    report({ id: "3183", title: "Seed swap", imageUrl: null, tags: [], vouchers: [] }),
  ];
  mocks.tags = [
    { tag: "Water", count: 4 },
    { tag: "Training", count: 2 },
  ];
});

describe("the Posts feed", () => {
  it("lays cards out in an intrinsic grid that is never forced to three columns", () => {
    render(<PostsDesk />);

    const list = screen.getByRole("list", { name: "Posts" });
    expect(list.className).toContain("grid-cols-[repeat(auto-fill,minmax(220px,1fr))]");
    expect(list.className).not.toContain("grid-cols-3");
  });

  it("keeps each populated card readable: image, a clamped title, capped tags, date and voucher", () => {
    render(<PostsDesk />);

    const card = within(screen.getByRole("list", { name: "Posts" })).getAllByRole(
      "link",
    )[0] as HTMLElement;
    expect(card.getAttribute("href")).toBe("/posts/3182");
    const title = within(card).getByText("Harvesting greengrams with Wendo group");
    expect(title.className).toContain("line-clamp-2");
    expect(card.querySelector("img")).not.toBeNull();
    // Two tags show; the third is a count, not a squeezed chip.
    expect(within(card).getByText("Food production")).toBeTruthy();
    expect(within(card).getByText("Training")).toBeTruthy();
    expect(within(card).queryByText("Water")).toBeNull();
    expect(within(card).getByText("+1")).toBeTruthy();
    expect(card.querySelector("time")?.getAttribute("datetime")).toBe("2026-07-19T08:14:02.311Z");
    expect(within(card).getByText("KCH")).toBeTruthy();
  });

  it("searches with a short placeholder and keeps an accessible name", () => {
    render(<PostsDesk />);

    const search = screen.getByRole("searchbox", { name: "Search posts" });
    expect(search.getAttribute("placeholder")).toBe("Search posts");
    expect(screen.queryByPlaceholderText(/by title or description/i)).toBeNull();
  });
});

describe("the Posts filters", () => {
  it("keeps one filter region and opens it from a Filters control", () => {
    render(<PostsDesk />);

    const toggle = screen.getByRole("button", { name: "Filters" });
    const region = screen.getByRole("complementary", { name: "Filter posts" });
    const container = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(container?.contains(region)).toBe(true);
    // Closed, a canvas with no room to dock the facets hides them.
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container?.className).toContain("@max-[56rem]:hidden");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container?.className).not.toContain("@max-[56rem]:hidden");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container?.className).toContain("@max-[56rem]:hidden");
    expect(screen.getAllByRole("complementary", { name: "Filter posts" })).toHaveLength(1);
  });

  it("only shows the Filters control where the facets cannot dock", () => {
    render(<PostsDesk />);

    expect(screen.getByRole("button", { name: "Filters" }).className).toContain(
      "@min-[56rem]:hidden",
    );
  });

  it("says how many filters are on, so a closed panel does not hide them", () => {
    mocks.search = { tags: "Water,Training" };
    render(<PostsDesk />);

    expect(screen.getByRole("button", { name: "Filters 2" })).toBeTruthy();
  });

  it("applies a category chosen in the opened panel", () => {
    render(<PostsDesk />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const panel = screen.getByRole("complementary", { name: "Filter posts" });
    fireEvent.click(within(panel).getByRole("button", { name: /Water/ }));

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const search = mocks.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(search({})).toMatchObject({ tags: "Water" });
  });
});
