import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher, MarketVoucherDetail } from "@clc/api/features/market/client";
import type { MapSheetSnap } from "#/components/ui/map-sheet";
import type { VoucherSheetTab } from "#/lib/navigation/voucher-sheet-search";

const { detailResult, detailError, offeringRequests, poolRequests, mapsRequests, selection } =
  vi.hoisted(() => ({
    selection: { voucherTab: "offerings" as string, close: vi.fn() },
    detailResult: { current: undefined as MarketVoucherDetail | undefined },
    detailError: { current: false, refetch: vi.fn() },
    offeringRequests: { current: [] as (string | undefined)[] },
    poolRequests: { current: [] as unknown[] },
    mapsRequests: { current: [] as unknown[] },
  }));

vi.mock("#/lib/navigation/use-voucher-sheet-selection", () => ({
  useVoucherSheetSelection: () => ({
    voucher: VOUCHER,
    voucherTab: selection.voucherTab,
    open: vi.fn(),
    close: selection.close,
  }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data: detailResult.current,
    isError: detailError.current,
    refetch: detailError.refetch,
  }),
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: (address: string | undefined) => {
    offeringRequests.current.push(address);
    return { data: undefined };
  },
}));

vi.mock("#/lib/api/pools", () => ({
  poolsClient: {
    getFilteredPools: async (params: unknown) => {
      poolRequests.current.push(params);
      return {
        pools: [
          {
            address: "0x1111111111111111111111111111111111111111",
            name: "Kilifi Pool",
            imageUrl: null,
            voucherCount: 4,
          },
        ],
        receivedCount: 1,
        first: 1,
        last: 1,
        tagFacets: null,
        voucherFacets: null,
      };
    },
  },
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: (target: unknown) => {
    mapsRequests.current.push(target);
    return true;
  },
}));

vi.mock("#/components/vouchers/voucher-offerings-panel", () => ({
  VoucherOfferingsPanel: () => <div id="voucher-panel-offerings">Offerings panel</div>,
}));

vi.mock("#/components/reviews/voucher-reviews-panel", () => ({
  VoucherReviewsPanel: () => <div id="voucher-panel-reviews">Reviews panel</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    replace,
    state,
    resetScroll: _resetScroll,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    search?:
      | Record<string, unknown>
      | ((previous: Record<string, unknown>) => Record<string, unknown>);
    replace?: boolean;
    state?: unknown;
    resetScroll?: boolean;
    children?: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    );
    const resolved =
      typeof search === "function" ? search({ tab: "market", voucher: VOUCHER }) : (search ?? {});
    const query = new URLSearchParams(
      Object.entries(resolved).flatMap(([key, value]): [string, string][] =>
        typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [],
      ),
    ).toString();
    return (
      <a
        href={query ? `${path}?${query}` : path}
        data-replace={replace ? "true" : undefined}
        data-keep-state={state === true ? "true" : undefined}
        {...rest}
      >
        {children}
      </a>
    );
  },
}));

import { VoucherSheet, type VoucherPlaceholder } from "./voucher-sheet";

const VOUCHER = "0xAbC0000000000000000000000000000000000123";

const CATALOG: VoucherPlaceholder & MarketVoucher = {
  id: "1",
  chainId: 100,
  address: VOUCHER,
  name: "Priscilah Malii",
  symbol: "MALII",
  iconUrl: null,
  locationName: "Kilifi",
  lat: -3.63,
  lng: 39.85,
  kind: "goods",
};

function detail(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "1",
    chainId: 100,
    address: VOUCHER,
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 6,
    ownerAddress: null,
    description: "Fresh vegetables from the farm.",
    voucherUoa: "KSH",
    voucherValue: "10",
    locationName: "Kilifi",
    lat: -3.63,
    lng: 39.85,
    email: null,
    website: null,
    phone: null,
    terms: null,
    iconUrl: null,
    bannerUrl: null,
    tags: [],
    kind: "goods",
    active: true,
    ...overrides,
  } as MarketVoucherDetail;
}

function Sheet({
  placeholder = CATALOG,
  initialSnap = "peek",
  onSnapChange,
}: {
  placeholder?: VoucherPlaceholder | null;
  initialSnap?: MapSheetSnap;
  onSnapChange?: (snap: MapSheetSnap) => void;
}) {
  const [snap, setSnap] = useState<MapSheetSnap>(initialSnap);
  return (
    <VoucherSheet
      placeholder={placeholder}
      origin={{ from: "wallet" }}
      snap={snap}
      onSnapChange={(next) => {
        onSnapChange?.(next);
        setSnap(next);
      }}
    />
  );
}

function renderSheet({
  voucherTab = "offerings",
  ...props
}: Parameters<typeof Sheet>[0] & { voucherTab?: VoucherSheetTab } = {}) {
  selection.voucherTab = voucherTab;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Sheet {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  detailResult.current = undefined;
  detailError.current = false;
  detailError.refetch.mockReset();
  selection.close.mockReset();
  offeringRequests.current = [];
  poolRequests.current = [];
  mapsRequests.current = [];
});

describe("VoucherSheet peek", () => {
  it("draws from the catalog row before detail arrives", () => {
    renderSheet();

    const card = screen.getByRole("dialog", { name: "Priscilah Malii" });
    expect(card.textContent).toContain("MALII");
    expect(card.textContent).toContain("Goods");
    expect(card.textContent).toContain("Kilifi");
    expect(card.textContent).not.toContain("=");
  });

  it("says so when a linked voucher cannot be loaded, and offers a retry", () => {
    detailError.current = true;
    renderSheet({ placeholder: null });

    expect(screen.getByRole("dialog", { name: "Couldn't load this voucher." })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Get" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(detailError.refetch).toHaveBeenCalledTimes(1);
  });

  it("adds the rate once detail arrives", () => {
    detailResult.current = detail();
    renderSheet();

    expect(screen.getByRole("dialog").textContent).toContain("1 MALII = 10 KSH");
  });

  it("offers Call and Website only when the voucher lists them", () => {
    detailResult.current = detail();
    const { unmount } = renderSheet();
    expect(screen.queryByRole("link", { name: "Call" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Website" })).toBeNull();
    unmount();

    detailResult.current = detail({ phone: "+254700000000", website: "https://malii.example" });
    renderSheet();
    expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe(
      "tel:+254700000000",
    );
    expect(screen.getByRole("link", { name: "Website" }).getAttribute("href")).toBe(
      "https://malii.example",
    );
  });

  it("never links a website that is not http(s)", () => {
    detailResult.current = detail({ website: "javascript:alert(1)" });
    renderSheet();

    expect(screen.queryByRole("link", { name: "Website" })).toBeNull();
  });

  it("sends Get to the pools that give out this voucher", () => {
    renderSheet();

    expect(screen.getByRole("link", { name: "Get" }).getAttribute("href")).toBe(
      `/pools?out_voucher=${VOUCHER.toLowerCase()}`,
    );
  });

  it("opens Directions at the voucher's location", () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Directions" }));

    expect(mapsRequests.current).toEqual([{ label: "Kilifi", lat: -3.63, lng: 39.85 }]);
  });

  it("shares the card's own link", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      renderSheet();

      fireEvent.click(screen.getByRole("button", { name: "Share" }));

      await waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          title: "Priscilah Malii",
          url: `${window.location.origin}/?voucher=${VOUCHER}`,
        }),
      );
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });

  it("expands to half when the header is tapped", () => {
    const onSnapChange = vi.fn();
    renderSheet({ onSnapChange });

    fireEvent.click(screen.getByRole("heading", { name: "Priscilah Malii" }));

    expect(onSnapChange).toHaveBeenCalledWith("half");
  });
});

describe("VoucherSheet half", () => {
  it("asks for pools and offerings only once half is reached", async () => {
    detailResult.current = detail();
    renderSheet();
    expect(poolRequests.current).toEqual([]);
    expect(offeringRequests.current).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(await screen.findByText("Kilifi Pool")).toBeTruthy();
    expect(poolRequests.current).toHaveLength(1);
    expect(poolRequests.current[0]).toMatchObject({
      perPage: 10,
      filter: { vouchers: [{ chainId: 100, address: VOUCHER }] },
    });
    expect(offeringRequests.current).toContain(VOUCHER);
  });

  it("keeps the half tier mounted after collapsing, so it does not refetch", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "half" });
    await screen.findByText("Kilifi Pool");

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(screen.getByText("Kilifi Pool")).toBeTruthy();
    expect(poolRequests.current).toHaveLength(1);
  });

  it("swaps into a pool with this voucher preselected, and lists the rest", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "half" });

    const swap = await screen.findByRole("link", { name: "Swap" });
    expect(swap.getAttribute("href")).toBe(
      `/pools/0x1111111111111111111111111111111111111111/swap?receive=${VOUCHER}`,
    );
    expect(screen.getByRole("link", { name: "See all" }).getAttribute("href")).toBe(
      `/pools?out_voucher=${VOUCHER.toLowerCase()}`,
    );
  });

  it("clamps the description and lets the text set its own direction", () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "half" });

    const description = screen.getByText("Fresh vegetables from the farm.");
    expect(description.getAttribute("dir")).toBe("auto");
    expect(description.className).toContain("line-clamp-3");
  });
});

describe("VoucherSheet full", () => {
  it("opens on Offerings, then Reviews, then Overview", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full" });

    await screen.findByRole("tab", { name: "Offerings", selected: true });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Offerings",
      "Reviews",
      "Overview",
    ]);
    expect(screen.getByText("Offerings panel")).toBeTruthy();
  });

  it("switches tabs in place, without adding history", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full" });

    const reviews = await screen.findByRole("tab", { name: "Reviews" });
    expect(reviews.getAttribute("href")).toContain("voucherTab=reviews");
    expect(reviews.getAttribute("data-replace")).toBe("true");
    // Keeps the mark that lets Close pop the entry the tap pushed.
    expect(reviews.getAttribute("data-keep-state")).toBe("true");
  });

  it("reads the description in full above the tabs and shows the rate once", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full", voucherTab: "overview" });

    await screen.findByRole("tab", { name: "Overview", selected: true });
    const descriptions = screen.getAllByText("Fresh vegetables from the farm.");
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]!.className).not.toContain("line-clamp");
    expect(screen.getAllByText("1 MALII = 10 KSH")).toHaveLength(1);
  });

  it("shows the chosen tab's panel, and drops the tab for the default", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full", voucherTab: "reviews" });

    expect(await screen.findByText("Reviews panel")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Offerings" }).getAttribute("href")).not.toContain(
      "voucherTab",
    );
  });

  it("leaves for the voucher's page, carrying where the card was opened", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full" });

    const page = await screen.findByRole("link", { name: "Open voucher page" });
    expect(page.getAttribute("href")).toBe(`/vouchers/${VOUCHER}?from=wallet`);
    // Filled in the brand colour, unlike the outlined actions above it.
    expect(page.getAttribute("data-variant")).toBe("default");
  });

  it("has no app bar above the header at full", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full" });

    await screen.findByRole("tab", { name: "Offerings", selected: true });
    expect(screen.getAllByText("Priscilah Malii")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Share" })).toHaveLength(1);
  });
});
