import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CATALOG_FILTER_PREFERENCE_KEYS } from "#/lib/navigation/catalog-filter-preference-storage";

const { getPoolVouchers, routeSearch, navigate } = vi.hoisted(() => ({
  getPoolVouchers: vi.fn(),
  routeSearch: { current: {} as Record<string, unknown> },
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => routeSearch.current,
  useNavigate: () => navigate,
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    replace: _replace,
    resetScroll: _resetScroll,
    preload: _preload,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a {...(props as React.ComponentProps<"a">)}>{children}</a>
  ),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
}));

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchers: () => {
    getPoolVouchers();
    return [];
  },
  usePoolVouchersInfinite: () => {
    getPoolVouchers();
    return { data: undefined, isPending: false };
  },
}));

import { PoolsPage } from "./pools-page";

const POOL_TAG_FACETS = [
  { tag: "Food", count: 2 },
  { tag: "Growing", count: 0 },
];

function jsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

const POOLS = [
  {
    address: "0x1111111111111111111111111111111111111111",
    name: "Trade Pool",
    voucherCount: 35,
    tags: ["Food", "Growing"],
  },
  {
    address: "0x2222222222222222222222222222222222222222",
    name: "Solo Pool",
    voucherCount: 1,
    tags: [],
  },
  {
    address: "0x3333333333333333333333333333333333333333",
    name: "Empty Pool",
    voucherCount: 0,
    tags: [],
  },
];

function mockPoolsList() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("perPage=1&")) {
        return Promise.resolve(
          jsonResponse({ pools: [], first: 0, last: 0, tagFacets: POOL_TAG_FACETS }),
        );
      }
      if (url.includes("/api/v2/pools?")) {
        return Promise.resolve(
          jsonResponse({
            pools: POOLS.map((pool, index) => ({
              id: index + 1,
              chainId: 42220,
              address: pool.address,
              name: pool.name,
              symbol: "TRD",
              decimals: 6,
              voucherCount: pool.voucherCount,
              tags: pool.tags,
            })),
            first: 1,
            last: POOLS.length,
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }),
  );
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  getPoolVouchers.mockReset();
  routeSearch.current = {};
  navigate.mockReset();
});

describe("pools list", () => {
  it("renders each pool's own voucher count without a per-row request", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    expect(await screen.findByText("Trade Pool")).toBeTruthy();

    expect(screen.getByText("35 vouchers")).toBeTruthy();
    expect(screen.getByText("1 voucher")).toBeTruthy();
    expect(screen.getByText("0 vouchers")).toBeTruthy();

    expect(getPoolVouchers).not.toHaveBeenCalled();

    const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([input]) =>
      String(input),
    );
    expect(urls.filter((url) => url.includes("/vouchers"))).toHaveLength(0);
    expect(urls.filter((url) => !url.includes("facets=true"))).toHaveLength(1);
  });

  it("uses the compact sharp-edged filter sheet and remembers applied facets", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    await screen.findByText("Trade Pool");
    expect(screen.queryByText("Explore community pools and their vouchers.")).toBeNull();
    expect(screen.queryByRole("group", { name: "Filter by tag" })).toBeNull();
    expect(screen.getByRole("region", { name: "Pools list" }).className).not.toMatch(/rounded-/);

    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger.className).toContain("h-9");
    fireEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Filter pools" });
    expect(sheet.className).toContain("rounded-none");
    expect(within(sheet).getByRole("heading", { name: "Filter pools" }).className).toContain(
      "sr-only",
    );
    expect(within(sheet).getByRole("button", { name: "Close filters" }).className).toContain(
      "sr-only",
    );
    const filterContent = sheet.querySelector<HTMLElement>(".overflow-y-auto");
    expect(filterContent?.className).toContain("border-b");
    expect(filterContent?.className).not.toContain("border-y");
    fireEvent.click(within(sheet).getByRole("button", { name: /Food/ }));
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(window.localStorage.getItem(CATALOG_FILTER_PREFERENCE_KEYS.pools) ?? "null"),
    ).toEqual({ tags: ["Food"], tagMatch: "any", vouchers: [], voucherMatch: "any" });
  });

  it("offers no filter controls it cannot honour", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    await screen.findByText("Trade Pool");

    expect(screen.queryByRole("button", { name: "Near me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Most active" })).toBeNull();
  });

  it("sizes the search field with the default input height", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    const search = await screen.findByLabelText("Search pools");
    expect(search.className).not.toContain("h-11");
  });

  it("shows each pool's own curated tags on the row", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    const row = (await screen.findByText("Trade Pool")).closest("a");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Food")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Growing")).toBeTruthy();
  });

  it("has a search field that is no longer read-only", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    const search = (await screen.findByLabelText("Search pools")) as HTMLInputElement;
    expect(search.readOnly).toBe(false);
  });
});

describe("pools filter failures", () => {
  function mockPoolsError(status: number, code?: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("perPage=1&")) {
          return Promise.resolve(jsonResponse({ pools: [], tagFacets: POOL_TAG_FACETS }));
        }
        return Promise.resolve({
          ok: false,
          status,
          statusText: "",
          text: () =>
            Promise.resolve(JSON.stringify({ ok: false, code, description: "backend prose" })),
        });
      }),
    );
  }

  it("offers Clear for a 400, which is the only status meaning invalid parameters", async () => {
    routeSearch.current = { tags: "NotATag" };
    mockPoolsError(400, "E04");
    renderWithQueryClient(<PoolsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("These filters aren't valid.");
    expect(within(alert).getByRole("button", { name: "Clear filters" })).toBeTruthy();
    expect(alert.textContent).not.toContain("backend prose");
  });

  it("does not blame the filters for an expired session", async () => {
    routeSearch.current = { q: "food" };
    mockPoolsError(401);
    renderWithQueryClient(<PoolsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("These filters aren't valid.");
    expect(alert.textContent).toContain("Couldn't load pools.");
  });

  it("reports a rate limit with no action to take", async () => {
    routeSearch.current = { q: "food" };
    mockPoolsError(429);
    renderWithQueryClient(<PoolsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many searches");
    expect(within(alert).queryByRole("button")).toBeNull();
  });
});
