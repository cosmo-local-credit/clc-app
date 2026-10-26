import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "@clc/api/client/errors";
import type { MarketVoucher } from "@clc/api/features/market/client";
import { FilteredCatalogTooLargeError } from "#/features/home/hooks/use-filtered-market-vouchers";
import { MARKET_FILTER_PREFERENCES_NAME } from "#/features/home/hooks/use-market-filter";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => "0xabc0000000000000000000000000000000000123",
}));

vi.mock("#/features/home/hooks/use-market-search-suggestions", () => ({
  useMarketSearchSuggestions: () => ({ tags: [], vouchers: [], pools: [] }),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("#/features/home/hooks/use-creditable-browse", () => ({
  useCreditableBrowse: () => ({
    auth: { isAuthenticated: false, isLoading: false },
    parsed: { ok: true, enabled: null },
    enabled: false,
    verification: { status: "loading", pools: [], retry: vi.fn() },
    poolRefs: undefined,
    blocksResults: false,
  }),
}));

vi.mock("#/components/creditable-browse-control", () => ({
  CreditableBrowseControl: ({
    part,
    onChange,
    onClear,
  }: {
    part: "control" | "feedback";
    onChange: (checked: boolean) => void;
    onClear: () => void;
  }) => (
    <div data-testid={`credit-${part}`}>
      <button type="button" onClick={() => onChange(true)}>
        {part} Credit on
      </button>
      <button type="button" onClick={onClear}>
        {part} Credit clear
      </button>
    </div>
  ),
}));

const MARKET_FILTER_PREFERENCES_KEY = ownerScopedKey(
  "0xabc0000000000000000000000000000000000123",
  MARKET_FILTER_PREFERENCES_NAME,
);

const mocks = vi.hoisted(() => ({
  camera: {
    realFix: null as { lat: number; lng: number } | null,
    locationStatus: "idle",
    requestLocation: vi.fn(),
  },
  catalog: {
    vouchers: [] as MarketVoucher[],
    isCatalogComplete: true,
    error: null as Error | null,
    retry: vi.fn(),
  },
  intersectionCallback: null as IntersectionObserverCallback | null,
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  filtered: {
    data: undefined as { vouchers: MarketVoucher[]; tagFacets: null } | undefined,
    error: null as Error | null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  },
  filteredFilters: [] as (CatalogFilter | null)[],
  vocabulary: undefined as { tag: string; count: number }[] | undefined,
}));

function scalar(key: string, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`search value for ${key} is not a URL scalar`);
}

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  useMarketCamera: () => mocks.camera,
}));

vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => mocks.camera.realFix,
}));

vi.mock("#/features/home/hooks/use-market-vouchers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/home/hooks/use-market-vouchers")>();
  return {
    ...actual,
    useMarketMapVouchers: (_viewport: unknown, _perPage: unknown, enabled = true) =>
      enabled ? mocks.catalog : { ...mocks.catalog, vouchers: [] },
  };
});

vi.mock("#/features/home/hooks/use-filtered-market-vouchers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/features/home/hooks/use-filtered-market-vouchers")>();
  return {
    ...actual,
    useFilteredMarketVouchers: (filter: CatalogFilter | null) => {
      mocks.filteredFilters.push(filter);
      return { ...mocks.filtered, isEnabled: filter !== null };
    },
    useMarketFacetVocabulary: () => ({ data: mocks.vocabulary }),
  };
});

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useCanGoBack: () => false,
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?:
      | Record<string, string | undefined>
      | ((previous: Record<string, unknown>) => Record<string, unknown>);
    children: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    const resolved = typeof search === "function" ? search(mocks.search) : (search ?? {});
    const query = new URLSearchParams(
      Object.entries(resolved).flatMap(([key, value]): [string, string][] => {
        if (value === undefined) return [];
        if (Array.isArray(value)) return value.map((entry) => [key, scalar(key, entry)]);
        return [[key, scalar(key, value)]];
      }),
    ).toString();
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    );
  },
}));

import { MarketListPage } from "./market-list-page";

function voucher(
  id: number,
  lat: number,
  lng: number,
  overrides: Partial<MarketVoucher> = {},
): MarketVoucher {
  return {
    id: String(id),
    chainId: 42220,
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Voucher ${id}`,
    symbol: `V${id}`,
    iconUrl: null,
    locationName: `Place ${id}`,
    lat,
    lng,
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.camera = {
    realFix: null,
    locationStatus: "idle",
    requestLocation: vi.fn(),
  };
  mocks.catalog = {
    vouchers: [],
    isCatalogComplete: true,
    error: null,
    retry: vi.fn(),
  };
  mocks.search = {};
  mocks.navigate = vi.fn();
  mocks.filtered = {
    data: undefined,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
  mocks.filteredFilters = [];
  mocks.vocabulary = undefined;
  mocks.intersectionCallback = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        mocks.intersectionCallback = callback;
      }

      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

describe("MarketListPage", () => {
  it("writes and clears Credit from both shell and feedback controls", () => {
    render(<MarketListPage />);

    fireEvent.click(screen.getByRole("button", { name: "control Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "control Credit clear" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit on" }));
    fireEvent.click(screen.getByRole("button", { name: "feedback Credit clear" }));

    expect(mocks.navigate).toHaveBeenCalledTimes(4);
    const previous = { scope: "vouchers", q: "art", creditable: false };
    const [shellOn, shellClear, feedbackOn, feedbackClear] = mocks.navigate.mock.calls.map(
      ([call]) => call,
    );
    expect(shellOn).toMatchObject({ to: "/market" });
    expect(shellOn.search(previous)).toEqual({ ...previous, creditable: true });
    expect(shellClear).toMatchObject({ to: "/market", replace: true });
    expect(shellClear.search(previous)).toEqual({ scope: "vouchers", q: "art" });
    expect(feedbackOn).toMatchObject({ to: "." });
    expect(feedbackOn.search(previous)).toEqual({ ...previous, creditable: true });
    expect(feedbackClear).toMatchObject({ to: ".", replace: true });
    expect(feedbackClear.search(previous)).toEqual({ scope: "vouchers", q: "art" });
  });

  it("renders the first catalog page immediately when no location fix exists", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [voucher(1, -1.29, 36.82)],
      isCatalogComplete: false,
    };

    render(<MarketListPage />);

    expect(screen.queryByText("Loading marketplace…")).toBeNull();
    expect(screen.getByLabelText("Vouchers list")).toBeTruthy();
  });

  it("waits for the complete catalog before proximity ordering", () => {
    mocks.camera = {
      ...mocks.camera,
      realFix: { lat: -1.29, lng: 36.82 },
    };
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [voucher(1, -1.29, 36.82)],
      isCatalogComplete: false,
    };

    render(<MarketListPage />);

    expect(screen.getByText("Loading marketplace…")).toBeTruthy();
    expect(screen.queryByLabelText("Vouchers list")).toBeNull();
  });

  it("orders the complete catalog by raw distance from a real fix", () => {
    mocks.camera = {
      ...mocks.camera,
      realFix: { lat: -1.29, lng: 36.82 },
    };
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [
        voucher(1, -4.0435, 39.6682, { name: "Far voucher" }),
        voucher(2, -1.2905, 36.8205, { name: "Near voucher" }),
        voucher(3, -1.5, 37, { name: "Middle voucher" }),
      ],
    };

    render(<MarketListPage />);

    const list = screen.getByLabelText("Vouchers list");
    expect(
      within(list)
        .getAllByRole("link")
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("Near voucher"),
      expect.stringContaining("Middle voucher"),
      expect.stringContaining("Far voucher"),
    ]);
    expect(screen.queryByText("Vouchers ordered by approximate distance.")).toBeNull();
  });

  it("reveals the complete sorted catalog in infinite-scroll batches", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: Array.from({ length: 25 }, (_, index) =>
        voucher(25 - index, -1.29 - index * 0.001, 36.82),
      ),
    };

    render(<MarketListPage />);

    const list = screen.getByLabelText("Vouchers list");
    expect(within(list).getAllByRole("link")).toHaveLength(20);

    act(() => {
      mocks.intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(within(list).getAllByRole("link")).toHaveLength(25);
  });

  it("keeps location controls out while retaining Map in the shared navigation", () => {
    render(<MarketListPage />);

    expect(screen.queryByRole("button", { name: "Use location" })).toBeNull();
    expect(screen.getByRole("link", { name: "Map" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filter vouchers" });
    expect(within(sheet).queryByRole("button", { name: "Use location" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Update location" })).toBeNull();
    expect(mocks.camera.requestLocation).not.toHaveBeenCalled();
  });

  it("puts Filters in the search row and Credit before the list badges", () => {
    render(<MarketListPage />);

    const filters = screen.getByRole("button", { name: "Filters" });
    const credit = screen.getByRole("button", { name: "control Credit on" });
    const pools = screen.getByRole("link", { name: "Pools" });
    const vouchers = screen.getByRole("link", { name: "Vouchers" });
    const offers = screen.getByRole("link", { name: "Offers" });
    const catalogs = screen.getByRole("link", { name: "Catalogs" });
    const wants = screen.getByRole("link", { name: "Wants" });
    const all = screen.getByRole("link", { name: "All" });

    expect(screen.getByRole("button", { name: FIELD }).closest(".border")?.contains(filters)).toBe(
      true,
    );
    expect(pools.getAttribute("href")).toBe("/market?scope=pools");
    expect(offers.getAttribute("href")).toBe("/market?scope=offers");
    expect(catalogs.getAttribute("href")).toBe("/market?scope=catalogs");
    // The open list's badge goes back to the map.
    expect(vouchers.getAttribute("aria-current")).toBe("page");
    expect(vouchers.getAttribute("href")).toBe("/");
    for (const [before, after] of [
      [filters, credit],
      [credit, all],
      [all, offers],
      [offers, wants],
      [wants, vouchers],
      [vouchers, pools],
      [pools, catalogs],
    ] as const) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(catalogs.parentElement?.className).toContain("overflow-x-auto");
  });

  it("removes the visible sheet header while preserving accessible controls", () => {
    mocks.camera = {
      ...mocks.camera,
      realFix: { lat: -1.29, lng: 36.82 },
    };
    render(<MarketListPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filter vouchers" });
    expect(within(sheet).getByRole("heading", { name: "Filter vouchers" }).className).toContain(
      "sr-only",
    );
    expect(within(sheet).getByRole("button", { name: "Close filters" }).className).toContain(
      "sr-only",
    );
    const filterContent = sheet.querySelector<HTMLElement>(".overflow-y-auto");
    expect(filterContent?.className).toContain("border-b");
    expect(filterContent?.className).not.toContain("border-y");
  });

  it("dismisses the filter sheet when the backdrop is pressed", () => {
    render(<MarketListPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("dialog", { name: "Filter vouchers" })).toBeTruthy();

    const backdrop = document.querySelector<HTMLElement>(".fixed.inset-0.z-40");
    expect(backdrop).toBeTruthy();
    fireEvent.pointerDown(backdrop as HTMLElement);
    fireEvent.pointerUp(backdrop as HTMLElement);
    fireEvent.click(backdrop as HTMLElement);

    expect(screen.queryByRole("dialog", { name: "Filter vouchers" })).toBeNull();
  });

  it("keeps the shared sheet and voucher list surfaces sharp-edged", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [voucher(1, -1.29, 36.82)],
    };
    render(<MarketListPage />);

    expect(screen.getByLabelText("Vouchers list").className).not.toMatch(/rounded-/);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filter vouchers" });
    expect(sheet.className).toContain("rounded-none");
    expect(sheet.className).not.toContain("rounded-t-2xl");
  });

  it("renders the catalog icon when one is available", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [
        voucher(1, -1.29, 36.82, {
          iconUrl: "https://content.example/voucher.png",
        }),
      ],
    };

    const { container } = render(<MarketListPage />);

    expect(container.querySelector('img[src="https://content.example/voucher.png"]')).toBeTruthy();
  });
  it("links a voucher directly to its canonical page", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [voucher(1, -1.29, 36.82, { name: "Near voucher" })],
    };

    render(<MarketListPage />);
    const row = within(screen.getByLabelText("Vouchers list")).getByRole("link");
    expect(row.getAttribute("href")).toBe(
      `/vouchers/${mocks.catalog.vouchers[0]!.address}?from=market`,
    );
  });

  it("preserves the filter when the active voucher badge links to the map", () => {
    mocks.search = { tab: "market", view: "list", q: "art" };

    render(<MarketListPage />);

    const href = screen.getByRole("link", { name: "Vouchers" }).getAttribute("href");
    expect(href).toContain("q=art");
    expect(href).not.toContain("view=map");
  });
});

describe("MarketListPage search", () => {
  it("keeps a one-character search in the field and issues no request for it", () => {
    render(<MarketListPage />);

    searchFor("a");

    expect(fieldText()).toBe("a");
    expect(mocks.filteredFilters.every((filter) => filter === null)).toBe(true);
  });

  it("renders the filtered-empty copy rather than the empty-catalog copy", () => {
    mocks.search = { q: "zzzz" };
    mocks.filtered = { ...mocks.filtered, data: { vouchers: [], tagFacets: null } };

    render(<MarketListPage />);

    expect(screen.getByText("No vouchers match this search.")).toBeTruthy();
    expect(screen.queryByText("No vouchers to show yet.")).toBeNull();
  });

  it("does not claim there are no matches while a cold filtered load is pending", () => {
    mocks.search = { q: "art" };
    mocks.filtered = { ...mocks.filtered, data: undefined };

    render(<MarketListPage />);

    expect(screen.queryByText("No vouchers match this search.")).toBeNull();
    expect(screen.getByText("Loading marketplace…")).toBeTruthy();
  });

  it("holds the previous rows while a new filter resolves", () => {
    mocks.search = { q: "art" };
    mocks.filtered = {
      ...mocks.filtered,
      data: { vouchers: [voucher(1, -1.29, 36.82)], tagFacets: null },
      isPlaceholderData: true,
    };

    render(<MarketListPage />);

    const list = screen.getByRole("region", { name: "Vouchers list" });
    expect(within(list).getAllByRole("link")).toHaveLength(1);
    expect(list.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("No vouchers match this search.")).toBeNull();
  });

  it("offers a way out of an over-limit link without issuing a request", () => {
    mocks.search = { tags: Array.from({ length: 13 }, (_, index) => `Tag${index}`) };

    render(<MarketListPage />);

    expect(screen.getByRole("alert").textContent).toContain("too many filters");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
    expect(mocks.filteredFilters.every((filter) => filter === null)).toBe(true);
    expect(screen.queryByText("No vouchers match this search.")).toBeNull();
  });

  it("explains a too-large filtered result instead of showing a truncated one", () => {
    mocks.search = { q: "ar" };
    mocks.filtered = {
      ...mocks.filtered,
      error: new FilteredCatalogTooLargeError(6),
    };

    render(<MarketListPage />);

    expect(screen.getByRole("alert").textContent).toContain("Too many matches");
  });

  it("reports a rate limit and offers manual recovery", () => {
    mocks.search = { q: "art" };
    mocks.filtered = { ...mocks.filtered, error: new BackendApiError(429, "rate limit exceeded") };

    render(<MarketListPage />);

    expect(screen.getByRole("alert").textContent).toContain("Too many searches");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.filtered.refetch).toHaveBeenCalledOnce();
  });

  it("reports an invalid filter generically, never by matching backend prose", () => {
    mocks.search = { tags: "NotATag" };
    mocks.filtered = {
      ...mocks.filtered,
      error: new BackendApiError(400, "tags contains a value outside the tag vocabulary", "E04"),
    };

    render(<MarketListPage />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("These filters aren't valid.");
    expect(alert.textContent).not.toContain("vocabulary");
  });
});

async function settleDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
}

const FIELD = "Search by name or symbol";

/** Searches through the screen the bar's field opens, as a person does. */
function searchFor(term: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${FIELD}`) }));
  const dialog = screen.getByRole("dialog", { name: FIELD });
  fireEvent.change(within(dialog).getByRole("searchbox", { name: FIELD }), {
    target: { value: term },
  });
  fireEvent.submit(within(dialog).getByRole("search"));
}

function fieldText() {
  return screen
    .getByRole("button", { name: new RegExp(`^${FIELD}`) })
    .textContent?.slice(FIELD.length)
    .trim();
}

describe("MarketListPage filter transitions", () => {
  it("keeps the searched term after it settles, and queries it exactly once", async () => {
    render(<MarketListPage />);

    searchFor("ar");

    expect(mocks.filteredFilters.every((filter) => filter === null)).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();

    await settleDebounce();

    expect(fieldText()).toBe("ar");

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const search = mocks.navigate.mock.calls[0]?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(search({})).toMatchObject({ q: "ar" });
  });

  it("never enables the query with a filter the key does not yet hold", async () => {
    render(<MarketListPage />);

    searchFor("ar");

    expect(mocks.filteredFilters.some((filter) => filter !== null)).toBe(false);

    await settleDebounce();

    expect(mocks.filteredFilters.at(-1)).toMatchObject({ term: "ar" });
  });

  it("adopts an externally changed term without writing the old one back", async () => {
    mocks.search = { q: "art" };
    const { rerender } = render(<MarketListPage />);

    await settleDebounce();
    mocks.navigate.mockClear();

    mocks.search = {};
    rerender(<MarketListPage />);
    await settleDebounce();

    expect(fieldText()).toBe("");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("clears during a pending debounce without the old term reappearing", async () => {
    mocks.search = { q: "art" };
    render(<MarketListPage />);

    searchFor("artis");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(fieldText()).toBe("");

    await settleDebounce();

    expect(fieldText()).toBe("");
    const last = mocks.navigate.mock.calls.at(-1)?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(last({ q: "art" }).q).toBeUndefined();
  });

  it("resets paging when the filter changes, but not as the catalog pages in", async () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      voucher(25 - index, -1.29 - index * 0.001, 36.82),
    );
    mocks.catalog = { ...mocks.catalog, vouchers: many };

    const { rerender } = render(<MarketListPage />);
    const list = screen.getByLabelText("Vouchers list");

    act(() => {
      mocks.intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(within(list).getAllByRole("link")).toHaveLength(25);

    mocks.catalog = { ...mocks.catalog, vouchers: [...many, voucher(99, -1.4, 36.9)] };
    rerender(<MarketListPage />);
    expect(within(screen.getByLabelText("Vouchers list")).getAllByRole("link")).toHaveLength(25);

    mocks.search = { q: "art" };
    mocks.filtered = { ...mocks.filtered, data: { vouchers: many, tagFacets: null } };
    rerender(<MarketListPage />);
    await settleDebounce();
    expect(within(screen.getByLabelText("Vouchers list")).getAllByRole("link")).toHaveLength(20);
  });
});

describe("MarketListPage filter sheet", () => {
  const VOCABULARY = [
    { tag: "Art", count: 3 },
    { tag: "Culture", count: 1 },
    { tag: "Mobility", count: 0 },
  ];

  function openFilters() {
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    return screen.getByRole("dialog", { name: "Filter vouchers" });
  }

  it("keeps facets out of the results flow until the filter sheet opens", () => {
    mocks.vocabulary = VOCABULARY;
    render(<MarketListPage />);

    expect(screen.queryByText("Search vouchers and filter by what they offer.")).toBeNull();
    expect(screen.queryByRole("group", { name: "Filter by tag" })).toBeNull();
    const sheet = openFilters();
    const row = within(sheet).getByRole("group", { name: "Filter by tag" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Art3", "Culture1", "Mobility0"]);
  });

  it("renders zero-count values without allowing an impossible new selection", () => {
    mocks.vocabulary = VOCABULARY;
    render(<MarketListPage />);

    const sheet = openFilters();
    expect(
      within(sheet)
        .getByRole("button", { name: /Mobility/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(within(sheet).getByRole("button", { name: /Art/ }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps a selected zero-count category operable", () => {
    mocks.search = { tags: "Mobility" };
    mocks.vocabulary = VOCABULARY;
    render(<MarketListPage />);

    const chip = within(openFilters()).getByRole("button", { name: /Mobility/ });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.hasAttribute("disabled")).toBe(false);
  });

  it("uses real, keyboard-focusable buttons for category choices", () => {
    mocks.vocabulary = VOCABULARY;
    render(<MarketListPage />);

    const chip = within(openFilters()).getByRole("button", { name: /Art/ });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.getAttribute("type")).toBe("button");
    chip.focus();
    expect(document.activeElement).toBe(chip);
  });

  it("stages category changes until Apply, then pushes once and saves the preference", () => {
    mocks.vocabulary = VOCABULARY;
    render(<MarketListPage />);

    const sheet = openFilters();
    fireEvent.click(within(sheet).getByRole("button", { name: /Art/ }));
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));
    const call = mocks.navigate.mock.calls.at(-1)?.[0];
    expect(call?.replace).toBeUndefined();
    const search = call?.search as (previous: Record<string, unknown>) => Record<string, unknown>;
    expect(search({})).toMatchObject({ tags: "Art" });
    expect(
      JSON.parse(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY) ?? "null"),
    ).toEqual({
      tags: ["Art"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
      pools: [],
      poolMatch: "any",
    });
  });

  it("removes a category only after Apply and clears an empty saved preference", () => {
    mocks.search = { tags: "Art" };
    mocks.vocabulary = VOCABULARY;
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({ tags: ["Art"], tagMatch: "any" }),
    );
    render(<MarketListPage />);

    const sheet = openFilters();
    fireEvent.click(within(sheet).getByRole("button", { name: /Art/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));

    const search = mocks.navigate.mock.calls.at(-1)?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(search({ tags: "Art" }).tags).toBeUndefined();
    expect(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY)).toBeNull();
  });

  it("disables unselected categories once the tag limit is reached", () => {
    const tags = Array.from({ length: 12 }, (_, index) => `Tag${index}`);
    mocks.search = { tags: tags.join(",") };
    mocks.vocabulary = [...tags.map((tag) => ({ tag, count: 2 })), { tag: "Extra", count: 5 }];
    render(<MarketListPage />);

    const sheet = openFilters();
    expect(within(sheet).getByRole("button", { name: /Extra/ }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(within(sheet).getByRole("button", { name: /Tag0/ }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("shows match options only once two selected categories make them meaningful", () => {
    mocks.vocabulary = VOCABULARY;
    mocks.search = { tags: "Art" };
    const { rerender } = render(<MarketListPage />);

    let sheet = openFilters();
    expect(within(sheet).queryByRole("button", { name: "All selected" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Apply filters" }));

    mocks.search = { tags: "Art,Culture" };
    rerender(<MarketListPage />);
    sheet = openFilters();
    expect(within(sheet).getByRole("button", { name: "All selected" })).toBeTruthy();
  });

  it("hides disjunctive counts while matching all selected categories", () => {
    mocks.vocabulary = VOCABULARY;
    mocks.search = { tags: "Art,Culture", tagMatch: "all" };
    render(<MarketListPage />);

    const row = within(openFilters()).getByRole("group", { name: "Filter by tag" });
    expect(
      within(row)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Art", "Culture", "Mobility"]);
  });

  it("keeps an applied category that the current vocabulary no longer offers", () => {
    mocks.search = { tags: "Retired" };
    mocks.vocabulary = VOCABULARY;
    render(<MarketListPage />);

    const chip = within(openFilters()).getByRole("button", { name: /Retired/ });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.hasAttribute("disabled")).toBe(false);
  });
});

describe("MarketListPage clear affordances", () => {
  it("clears only the term from the search box X, keeping the tags", () => {
    mocks.search = { q: "art", tags: "Art" };
    mocks.vocabulary = [{ tag: "Art", count: 3 }];

    render(<MarketListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    const search = mocks.navigate.mock.calls.at(-1)?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    const next = search({ q: "art", tags: "Art" });
    expect(next.q).toBeUndefined();
    expect(next.tags).toBe("Art");
  });

  it("clears the whole filter and its saved preference from a notice", () => {
    mocks.search = { q: "art", tags: "Art" };
    mocks.vocabulary = [{ tag: "Art", count: 3 }];
    mocks.filtered = {
      ...mocks.filtered,
      error: new BackendApiError(400, "invalid", "E04"),
    };
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({ tags: ["Art"], tagMatch: "any" }),
    );

    render(<MarketListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    const search = mocks.navigate.mock.calls.at(-1)?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    const next = search({ q: "art", tags: "Art", tagMatch: "all" });
    expect(next.q).toBeUndefined();
    expect(next.tags).toBeUndefined();
    expect(next.tagMatch).toBeUndefined();
    expect(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY)).toBeNull();
  });

  it("makes an over-limit deep link visible in both the notice and filter count", () => {
    mocks.search = { tags: Array.from({ length: 13 }, (_, index) => `Tag${index}`) };
    mocks.vocabulary = [{ tag: "Tag0", count: 3 }];

    render(<MarketListPage />);

    expect(screen.getByRole("alert").textContent).toContain("too many filters");
    const filters = screen.getByRole("button", { name: "Filters" });
    expect(filters.textContent).toBe("13");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("keeps rate-limit recovery separate from clearing filters", () => {
    mocks.search = { q: "art" };
    mocks.filtered = { ...mocks.filtered, error: new BackendApiError(429, "rate limited") };

    render(<MarketListPage />);

    expect(screen.getByRole("alert").textContent).toContain("Too many searches");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.filtered.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});
