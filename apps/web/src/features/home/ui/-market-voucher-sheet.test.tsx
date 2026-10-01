import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher, MarketVoucherDetail } from "@clc/api/features/market/client";
import type { MapSheetSnap } from "#/components/ui/map-sheet";
import type { MarketVoucherTab } from "#/lib/navigation/home-tabs";

const { detailResult, offeringRequests, poolRequests, mapsRequests } = vi.hoisted(() => ({
  detailResult: { current: undefined as MarketVoucherDetail | undefined },
  offeringRequests: { current: [] as (string | undefined)[] },
  poolRequests: { current: [] as unknown[] },
  mapsRequests: { current: [] as unknown[] },
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: detailResult.current }),
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
        {...rest}
      >
        {children}
      </a>
    );
  },
}));

import { MarketVoucherSheet } from "./market-voucher-sheet";

const VOUCHER = "0xAbC0000000000000000000000000000000000123";

const CATALOG: MarketVoucher = {
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
  initialSnap = "peek",
  voucherTab = "overview",
  onSnapChange,
}: {
  initialSnap?: MapSheetSnap;
  voucherTab?: MarketVoucherTab;
  onSnapChange?: (snap: MapSheetSnap) => void;
}) {
  const [snap, setSnap] = useState<MapSheetSnap>(initialSnap);
  return (
    <MarketVoucherSheet
      address={VOUCHER}
      open
      catalogVoucher={CATALOG}
      realFix={null}
      snap={snap}
      onSnapChange={(next) => {
        onSnapChange?.(next);
        setSnap(next);
      }}
      voucherTab={voucherTab}
      onClose={vi.fn()}
    />
  );
}

function renderSheet(props: Parameters<typeof Sheet>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Sheet {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  detailResult.current = undefined;
  offeringRequests.current = [];
  poolRequests.current = [];
  mapsRequests.current = [];
});

describe("MarketVoucherSheet peek", () => {
  it("draws from the catalog row before detail arrives", () => {
    renderSheet();

    const card = screen.getByRole("dialog", { name: "Priscilah Malii" });
    expect(card.textContent).toContain("MALII");
    expect(card.textContent).toContain("Goods");
    expect(card.textContent).toContain("Kilifi");
    expect(card.textContent).not.toContain("=");
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

describe("MarketVoucherSheet half", () => {
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
    // The handle comes first; the app bar's collapse only goes back to half.
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]!);

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

describe("MarketVoucherSheet full", () => {
  it("switches tabs in place, without adding history", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full" });

    const offerings = await screen.findByRole("tab", { name: "Offerings" });
    expect(offerings.getAttribute("href")).toContain("voucherTab=offerings");
    expect(offerings.getAttribute("data-replace")).toBe("true");
    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeTruthy();
  });

  it("shows the chosen tab's panel", async () => {
    detailResult.current = detail();
    renderSheet({ initialSnap: "full", voucherTab: "reviews" });

    expect(await screen.findByText("Reviews panel")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("href")).not.toContain(
      "voucherTab",
    );
  });

  it("collapses to half from the app bar and links to the voucher's page", async () => {
    const onSnapChange = vi.fn();
    detailResult.current = detail();
    renderSheet({ initialSnap: "full", onSnapChange });

    expect(
      (await screen.findByRole("link", { name: "Open voucher page" })).getAttribute("href"),
    ).toBe(`/vouchers/${VOUCHER}?from=market`);
    const [appBarCollapse] = screen
      .getAllByRole("button", { name: "Collapse" })
      .filter((button) => button.className.includes("size-11"));
    fireEvent.click(appBarCollapse!);

    expect(onSnapChange).toHaveBeenCalledWith("half");
  });
});
