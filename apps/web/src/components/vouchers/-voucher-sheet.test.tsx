import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher, MarketVoucherDetail } from "@clc/api/features/market/client";
import type { MapSheetSnap } from "#/components/ui/map-sheet";

const mocks = vi.hoisted(() => ({
  detail: undefined as MarketVoucherDetail | undefined,
  detailError: false,
  refetchDetail: vi.fn(),
  close: vi.fn(),
  maps: [] as unknown[],
  authenticated: false,
  sessionAddress: "0x9999999999999999999999999999999999999999",
  balance: "0",
  reviewSummary: { total: 0, average: 0 },
}));

vi.mock("#/lib/navigation/use-voucher-sheet-selection", () => ({
  useVoucherSheetSelection: () => ({ voucher: VOUCHER, open: vi.fn(), close: mocks.close }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data: mocks.detail,
    isError: mocks.detailError,
    refetch: mocks.refetchDetail,
  }),
}));

vi.mock("#/features/reviews/hooks/use-voucher-reviews", () => ({
  useVoucherReviewSummary: () => ({ summary: mocks.reviewSummary }),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: mocks.authenticated,
    session: mocks.authenticated ? { address: mocks.sessionAddress } : null,
  }),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({
    tokens: mocks.balance === "0" ? [] : [{ tokenAddress: VOUCHER, balance: mocks.balance }],
  }),
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: (target: unknown) => {
    mocks.maps.push(target);
    return true;
  },
}));

vi.mock("#/components/vouchers/voucher-offerings-panel", () => ({
  VoucherOfferingsPanel: ({ maxItems }: { maxItems?: number }) => (
    <div data-testid="offerings" data-max-items={maxItems}>
      Offerings panel
    </div>
  ),
}));

vi.mock("#/components/reviews/voucher-reviews-panel", () => ({
  VoucherReviewsPanel: () => <div data-testid="reviews">Reviews panel</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children?: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (result, [key, value]) => result.replace(`$${key}`, value),
      to,
    );
    const query = new URLSearchParams(
      Object.entries(search ?? {}).flatMap(([key, value]): [string, string][] =>
        typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [],
      ),
    ).toString();
    return (
      <a href={query ? `${path}?${query}` : path} {...rest}>
        {children}
      </a>
    );
  },
}));

import { VoucherSheet, type VoucherPlaceholder } from "./voucher-sheet";

const VOUCHER = "0xAbC0000000000000000000000000000000000123";
const OWNER = "0x1111111111111111111111111111111111111111";

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
  markerIcon: null,
  markerColor: null,
};

function detail(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "1",
    chainId: 100,
    address: VOUCHER,
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 6,
    ownerAddress: OWNER,
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
    tags: ["Food", "Farming", "Local", "Extra"],
    kind: "goods",
    active: true,
    markerIcon: null,
    markerColor: null,
    ...overrides,
  };
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

function renderSheet(props: Parameters<typeof Sheet>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Sheet {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.detail = undefined;
  mocks.detailError = false;
  mocks.refetchDetail.mockReset();
  mocks.close.mockReset();
  mocks.maps = [];
  mocks.authenticated = false;
  mocks.balance = "0";
  mocks.reviewSummary = { total: 0, average: 0 };
});

describe("VoucherSheet summary", () => {
  it("shows empty voucher-level reviews and location without kind or valuation", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Priscilah Malii" });
    expect(dialog.textContent).toContain("MALII");
    expect(dialog.textContent).toContain("(0)");
    expect(screen.getByRole("img", { name: "0 out of 5 stars" })).toBeTruthy();
    expect(dialog.textContent).toContain("Kilifi");
    expect(dialog.textContent).not.toContain("Goods");
    expect(dialog.textContent).not.toContain("=");
  });

  it("shows a half-star rating and at most three voucher tags", () => {
    mocks.detail = detail();
    mocks.reviewSummary = { total: 10, average: 4.4 };
    renderSheet();
    expect(screen.getByRole("img", { name: "4.4 out of 5 stars" })).toBeTruthy();
    expect(document.querySelectorAll('[data-state="half"]')).toHaveLength(1);
    expect(screen.getByText("(10)")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Farming")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
    expect(screen.queryByText("Extra")).toBeNull();
  });

  it("puts Share before Close and shares the voucher link", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      renderSheet();
      const shareButton = screen.getByRole("button", { name: "Share" });
      const closeButton = screen.getByRole("button", { name: "Close" });
      expect(
        shareButton.compareDocumentPosition(closeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      fireEvent.click(shareButton);
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

  it("shows Send and Redeem only for an authenticated positive balance", () => {
    mocks.detail = detail();
    const guest = renderSheet();
    expect(screen.queryByRole("link", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Redeem" })).toBeNull();
    guest.unmount();

    mocks.authenticated = true;
    mocks.balance = "2500000";
    renderSheet();
    expect(screen.getByRole("link", { name: "Send" }).getAttribute("href")).toBe(
      `/wallet/send?token=${VOUCHER}`,
    );
    expect(screen.getByRole("link", { name: "Redeem" }).getAttribute("href")).toBe(
      `/wallet/send/amount?token=${VOUCHER}&recipient=${OWNER}`,
    );
  });

  it.each([null, "not-an-address", "0x0000000000000000000000000000000000000000"])(
    "keeps Redeem hidden when the verified owner is %s",
    (ownerAddress) => {
      mocks.detail = detail({ ownerAddress: ownerAddress as `0x${string}` | null });
      mocks.authenticated = true;
      mocks.balance = "1";
      renderSheet();
      expect(screen.getByRole("link", { name: "Send" })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Redeem" })).toBeNull();
    },
  );

  it("keeps existing Get and Directions behavior", () => {
    renderSheet();
    expect(screen.getByRole("link", { name: "Get" }).getAttribute("href")).toBe(
      `/pools?out_voucher=${VOUCHER.toLowerCase()}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    expect(mocks.maps).toEqual([{ label: "Kilifi", lat: -3.63, lng: 39.85 }]);
  });
});

describe("VoucherSheet continuous content", () => {
  it("mounts offerings and reviews at half and keeps them mounted after collapse", async () => {
    mocks.detail = detail();
    renderSheet();
    expect(screen.queryByText("Offerings panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(await screen.findByText("Offerings panel")).toBeTruthy();
    expect(screen.getByText("Reviews panel")).toBeTruthy();
    expect(screen.getByTestId("offerings").getAttribute("data-max-items")).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.getByText("Offerings panel")).toBeTruthy();
  });

  it("has no old tabs, overview, or pool carousel", async () => {
    mocks.detail = detail();
    renderSheet({ initialSnap: "full" });
    expect(await screen.findByText("Offerings panel")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText("Pools with this voucher")).toBeNull();
    expect(screen.queryByText("Fresh vegetables from the farm.")).toBeNull();
  });

  it("opens the complete voucher page with its origin", async () => {
    mocks.detail = detail();
    renderSheet({ initialSnap: "half" });
    const page = await screen.findByRole("link", { name: "Open voucher page" });
    expect(page.getAttribute("href")).toBe(`/vouchers/${VOUCHER}?from=wallet`);
  });

  it("advances through snap points from the identity header", async () => {
    const onSnapChange = vi.fn();
    renderSheet({ onSnapChange });
    const title = screen.getByRole("heading", { name: "Priscilah Malii" });
    const header = title.parentElement?.parentElement;
    if (!header) throw new Error("expected the voucher identity header");
    fireEvent.click(header);
    fireEvent.click(header);
    expect(onSnapChange.mock.calls).toEqual([["half"], ["full"]]);
    expect(await screen.findByText("Reviews panel")).toBeTruthy();
  });
});

describe("VoucherSheet unavailable state", () => {
  it("offers Retry when a deep-linked voucher cannot be loaded", () => {
    mocks.detailError = true;
    renderSheet({ placeholder: null });
    expect(screen.getByRole("dialog", { name: "Couldn't load this voucher." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchDetail).toHaveBeenCalledTimes(1);
  });
});
