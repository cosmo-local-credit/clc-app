import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

const POOLS_FILTER_KEY = ownerScopedKey(
  "0xabc0000000000000000000000000000000000123",
  CATALOG_FILTER_PREFERENCE_NAMES.pools,
);

const { creditableState, outputState, getPoolVouchers, routeSearch, navigate } = vi.hoisted(() => ({
  creditableState: {
    current: {
      pools: [] as Array<{ address: string; name: string; voucherCount: number; tags: string[] }>,
      status: "ready" as "loading" | "ready" | "error",
      isRefreshing: false,
      hasVerificationGaps: false,
      retry: vi.fn(),
    },
  },
  outputState: {
    current: {
      pools: [] as Array<{ address: string; name: string; voucherCount: number; tags: string[] }>,
      status: "idle" as "idle" | "loading" | "ready" | "error",
      isRefreshing: false,
      hasVerificationGaps: false,
      retry: vi.fn(),
    },
  },
  getPoolVouchers: vi.fn(),
  routeSearch: { current: {} as Record<string, unknown> },
  navigate: vi.fn(),
}));

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xabc0000000000000000000000000000000000123",
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    address: "0xabc0000000000000000000000000000000000123",
    isAuthenticated: true,
    isLoading: false,
    state: "authenticated",
    session: { address: "0xabc0000000000000000000000000000000000123" },
  }),
}));

vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => null,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0xabc0000000000000000000000000000000000123" }),
}));

vi.mock("#/features/pools/hooks/use-creditable-pools", () => ({
  useCreditablePools: () => creditableState.current,
}));

vi.mock("#/features/pools/hooks/use-pool-output-availability", () => ({
  usePoolOutputAvailability: () => outputState.current,
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: undefined }),
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
const OUTPUT_VOUCHER = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363" as const;
const OTHER_VOUCHER = "0x2000000000000000000000000000000000000002" as const;
const POOL_VOUCHER_FACETS = [
  {
    chainId: 100,
    address: OUTPUT_VOUCHER,
    name: "Market Credit",
    symbol: "MKT",
    count: 2,
  },
  {
    chainId: 100,
    address: OTHER_VOUCHER,
    name: "Harvest Credit",
    symbol: "HRV",
    count: 1,
  },
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
          jsonResponse({
            pools: [],
            first: 0,
            last: 0,
            tagFacets: POOL_TAG_FACETS,
            voucherFacets: POOL_VOUCHER_FACETS,
          }),
        );
      }
      if (url.includes("/api/v2/pools?")) {
        const pools = url.includes("q=trade") ? POOLS.slice(0, 1) : POOLS;
        return Promise.resolve(
          jsonResponse({
            pools: pools.map((pool, index) => ({
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
  creditableState.current = {
    pools: [],
    status: "ready",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
  };
  outputState.current = {
    pools: [],
    status: "idle",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
  };
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

  it("keeps the labeled filter trigger and remembers applied facets", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    await screen.findByText("Trade Pool");
    expect(screen.queryByText("Explore community pools and their vouchers.")).toBeNull();
    expect(screen.queryByRole("group", { name: "Filter by tag" })).toBeNull();
    expect(screen.getByRole("region", { name: "Pools list" }).className).not.toMatch(/rounded-/);

    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger.className).toContain("h-9");
    expect(trigger.textContent).toContain("Filters");
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
    // The facet vocabulary is only requested once the sheet opens, so the chips arrive async.
    fireEvent.click(await within(sheet).findByRole("button", { name: /Food/ }));
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(POOLS_FILTER_KEY) ?? "null")).toEqual({
      tags: ["Food"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
    });
  });

  it("offers no filter controls it cannot honour", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    await screen.findByText("Trade Pool");

    expect(screen.queryByRole("button", { name: "Near me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Most active" })).toBeNull();
  });

  it("shows one standard Create action in the title row", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    await screen.findByText("Trade Pool");
    const createLabels = screen.getAllByText("Create");
    expect(createLabels).toHaveLength(1);
    expect(createLabels[0]?.closest("a")?.className).toContain("h-8");
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

describe("creditable pools", () => {
  it("shows all pools with Credit off even when eligibility is not loaded", async () => {
    creditableState.current = { ...creditableState.current, status: "loading" };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    expect(await screen.findByText("Trade Pool")).toBeTruthy();
    expect(screen.getByText("Solo Pool")).toBeTruthy();
    const credit = screen.getByRole("checkbox", { name: /Credit/ });
    expect(credit.hasAttribute("data-disabled")).toBe(false);
    expect(credit.getAttribute("data-checked")).toBeNull();
  });

  it("defaults Credit off even when verified creditable pools exist", async () => {
    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!, POOLS[2]!] };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    expect(credit.getAttribute("data-checked")).toBeNull();
    expect(await screen.findByText("Trade Pool")).toBeTruthy();
    expect(screen.getByText("Empty Pool")).toBeTruthy();
    expect(screen.getByText("Solo Pool")).toBeTruthy();
    expect(screen.getByText("3 pools")).toBeTruthy();
  });

  it("writes Credit on to the URL when the unchecked control is selected", async () => {
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    expect(credit.hasAttribute("disabled")).toBe(false);
    expect(credit.getAttribute("data-checked")).toBeNull();

    fireEvent.click(credit);
    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({ q: "trade" })).toEqual({ q: "trade", creditable: true });
  });

  it("forces explicit Credit on even when the verified result is empty", async () => {
    routeSearch.current = { creditable: "true" };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage creditableSearch="true" />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    await waitFor(() => expect(credit.getAttribute("data-checked")).not.toBeNull());
    expect(await screen.findByText("No creditable pools are available.")).toBeTruthy();
    expect(screen.queryByText("Trade Pool")).toBeNull();
  });

  it("forces explicit Credit off even when creditable pools exist", async () => {
    routeSearch.current = { creditable: "false" };
    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!] };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage creditableSearch="false" />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    expect(credit.getAttribute("data-checked")).toBeNull();
    expect(await screen.findByText("Trade Pool")).toBeTruthy();
    expect(screen.getByText("Solo Pool")).toBeTruthy();
  });

  it("writes manual Credit changes to the URL while preserving other filters", async () => {
    routeSearch.current = { q: "trade", out_voucher: OUTPUT_VOUCHER };
    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!] };
    outputState.current = { ...outputState.current, status: "ready", pools: [POOLS[0]!] };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage outputVoucherSearch={OUTPUT_VOUCHER} />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    expect(credit.getAttribute("data-checked")).toBeNull();
    fireEvent.click(credit);

    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({ q: "trade", out_voucher: OUTPUT_VOUCHER })).toEqual({
      q: "trade",
      out_voucher: OUTPUT_VOUCHER,
      creditable: true,
    });
  });

  it("rejects an invalid Credit URL without showing the normal catalog", async () => {
    routeSearch.current = { creditable: "yes" };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage creditableSearch="yes" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This link contains an invalid Credit filter.");
    expect(screen.queryByText("Trade Pool")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Clear filter" }));
    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({ q: "trade", creditable: "yes" })).toEqual({
      q: "trade",
      creditable: undefined,
    });
  });

  it("does not restore saved facets over an explicit Credit deep link", async () => {
    window.localStorage.setItem(
      POOLS_FILTER_KEY,
      JSON.stringify({
        tags: ["Food"],
        tagMatch: "any",
        vouchers: [],
        voucherMatch: "any",
      }),
    );
    routeSearch.current = { creditable: true };
    creditableState.current = { ...creditableState.current, pools: [POOLS[1]!] };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage creditableSearch={true} />);

    expect(await screen.findByText("Solo Pool")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps an explicit Credit choice when verified data refreshes", async () => {
    routeSearch.current = { creditable: true };
    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!] };
    mockPoolsList();
    const view = renderWithQueryClient(<PoolsPage creditableSearch={true} />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    await waitFor(() => expect(credit.getAttribute("data-checked")).not.toBeNull());
    expect(screen.getByText("Trade Pool")).toBeTruthy();
    expect(screen.queryByText("Solo Pool")).toBeNull();

    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!, POOLS[1]!] };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PoolsPage creditableSearch={true} />
      </QueryClientProvider>,
    );
    expect(credit.getAttribute("data-checked")).not.toBeNull();
    expect(screen.getByText("Solo Pool")).toBeTruthy();
  });

  it("intersects Credit with the current search result", async () => {
    routeSearch.current = { q: "trade", creditable: true };
    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!, POOLS[2]!] };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage creditableSearch={true} />);

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    await waitFor(() => expect(credit.getAttribute("data-checked")).not.toBeNull());
    expect(screen.getByText("Trade Pool")).toBeTruthy();
    expect(screen.queryByText("Empty Pool")).toBeNull();
    expect(screen.queryByText("Solo Pool")).toBeNull();
  });

  it("blocks the normal catalog and offers Retry when enabled Credit verification fails", async () => {
    const retry = vi.fn();
    routeSearch.current = { creditable: true };
    creditableState.current = { ...creditableState.current, status: "error", retry };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage creditableSearch={true} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't check creditable pools.");
    expect(screen.queryByText("Trade Pool")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("checkbox", { name: "Credit" }).hasAttribute("data-disabled")).toBe(
      false,
    );
  });

  it("discloses incomplete verification while retaining verified pools", async () => {
    creditableState.current = {
      ...creditableState.current,
      pools: [POOLS[0]!],
      hasVerificationGaps: true,
    };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage />);

    expect(
      await screen.findByText("Some pools couldn't be checked. Showing verified results."),
    ).toBeTruthy();
    expect(await screen.findByText("Trade Pool")).toBeTruthy();
  });
});

describe("output voucher availability", () => {
  it("shows only verified pools with the selected voucher available", async () => {
    outputState.current = {
      ...outputState.current,
      status: "ready",
      pools: [POOLS[1]!, POOLS[2]!],
    };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage outputVoucherSearch={OUTPUT_VOUCHER} />);

    expect(await screen.findByText("Solo Pool")).toBeTruthy();
    expect(screen.getByText("Empty Pool")).toBeTruthy();
    expect(screen.queryByText("Trade Pool")).toBeNull();
    expect(screen.getByText("2 pools")).toBeTruthy();
    expect(
      (screen.getByRole("combobox", { name: "Output voucher" }) as HTMLInputElement).value,
    ).toBe("Market Credit");
  });

  it("intersects Credit and output availability, then intersects the catalog search", async () => {
    routeSearch.current = { q: "trade", creditable: true };
    creditableState.current = {
      ...creditableState.current,
      pools: [POOLS[0]!, POOLS[2]!],
    };
    outputState.current = {
      ...outputState.current,
      status: "ready",
      pools: [POOLS[0]!, POOLS[1]!],
    };
    mockPoolsList();
    renderWithQueryClient(
      <PoolsPage creditableSearch={true} outputVoucherSearch={OUTPUT_VOUCHER} />,
    );

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    await waitFor(() => expect(credit.getAttribute("data-checked")).not.toBeNull());
    expect(screen.getByText("Trade Pool")).toBeTruthy();
    expect(screen.queryByText("Solo Pool")).toBeNull();
    expect(screen.queryByText("Empty Pool")).toBeNull();
    expect(screen.getByText("1 pool")).toBeTruthy();
  });

  it("keeps explicit Credit enabled while the output voucher changes", async () => {
    routeSearch.current = { creditable: true };
    creditableState.current = { ...creditableState.current, pools: [POOLS[0]!] };
    outputState.current = {
      ...outputState.current,
      status: "ready",
      pools: [POOLS[1]!],
    };
    mockPoolsList();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <PoolsPage creditableSearch={true} outputVoucherSearch={OUTPUT_VOUCHER} />
      </QueryClientProvider>,
    );

    const credit = await screen.findByRole("checkbox", { name: "Credit" });
    await waitFor(() => expect(credit.getAttribute("data-checked")).not.toBeNull());

    outputState.current = { ...outputState.current, pools: [POOLS[0]!] };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <PoolsPage creditableSearch={true} outputVoucherSearch={OTHER_VOUCHER} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(credit.getAttribute("data-checked")).not.toBeNull());
  });

  it("updates only out_voucher when choosing or clearing a voucher", async () => {
    outputState.current = { ...outputState.current, status: "ready" };
    mockPoolsList();
    const view = renderWithQueryClient(<PoolsPage />);
    const selector = await screen.findByRole("combobox", { name: "Output voucher" });
    fireEvent.click(selector);
    const choice = await screen.findByRole("option", { name: "Harvest Credit HRV" });
    fireEvent.pointerDown(choice, { pointerType: "touch" });
    fireEvent.click(choice);

    const selectCall = navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(selectCall.search({ q: "trade", tags: "Food" })).toEqual({
      q: "trade",
      tags: "Food",
      out_voucher: OTHER_VOUCHER,
    });

    navigate.mockReset();
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PoolsPage outputVoucherSearch={OTHER_VOUCHER} />
      </QueryClientProvider>,
    );
    const selected = screen.getByRole("combobox", { name: "Output voucher" });
    fireEvent.click(selected);
    const all = await screen.findByRole("option", { name: "All Vouchers" });
    fireEvent.pointerDown(all, { pointerType: "touch" });
    fireEvent.click(all);
    const clearCall = navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(clearCall.search({ q: "trade", out_voucher: OTHER_VOUCHER })).toEqual({
      q: "trade",
      out_voucher: undefined,
    });
  });

  it("does not restore saved facets over an explicit output-voucher deep link", async () => {
    window.localStorage.setItem(
      POOLS_FILTER_KEY,
      JSON.stringify({
        tags: ["Food"],
        tagMatch: "any",
        vouchers: [],
        voucherMatch: "any",
      }),
    );
    outputState.current = {
      ...outputState.current,
      status: "ready",
      pools: [POOLS[1]!],
    };
    mockPoolsList();
    renderWithQueryClient(<PoolsPage outputVoucherSearch={OUTPUT_VOUCHER} />);

    expect(await screen.findByText("Solo Pool")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never broadens an invalid or failed output filter to the normal catalog", async () => {
    mockPoolsList();
    const first = renderWithQueryClient(<PoolsPage outputVoucherSearch="not-an-address" />);
    expect(await screen.findByText("This link contains an invalid output voucher.")).toBeTruthy();
    expect(screen.queryByText("Trade Pool")).toBeNull();
    first.unmount();

    const retry = vi.fn();
    outputState.current = { ...outputState.current, status: "error", retry };
    renderWithQueryClient(<PoolsPage outputVoucherSearch={OUTPUT_VOUCHER} />);
    const alert = (await screen.findByText("Couldn't check voucher availability.")).parentElement!;
    expect(alert.textContent).toContain("Couldn't check voucher availability.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Trade Pool")).toBeNull();
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
