import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  authLoading: false,
  sessionAddress: "0x9999999999999999999999999999999999999999",
  balance: "0",
  balanceDecimals: 6,
  balancePending: false,
  balanceError: false,
  refetchBalance: vi.fn(),
  reviewSummary: { total: 0, average: 0 },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("#/components/catalogs/add-to-catalog-button", () => ({
  AddToCatalogButton: ({
    className,
    size,
    tap,
  }: {
    className?: string;
    size?: string;
    tap?: boolean;
  }) =>
    mocks.authenticated ? (
      <button type="button" className={className} data-size={size} data-tap={tap}>
        Add to catalog
      </button>
    ) : null,
}));

vi.mock("#/lib/navigation/use-voucher-sheet-selection", () => ({
  useVoucherSheetSelection: () => ({ voucher: VOUCHER, open: vi.fn(), close: mocks.close }),
}));

vi.mock("#/features/ownership/hooks/use-asset-owner-info", async () => {
  const { useAuthStatus } = await import("#/features/auth/hooks/use-auth-status");
  return {
    useAssetOwnerInfo: (_address: string, owner: string | null | undefined) => {
      const auth = useAuthStatus();
      return {
        owner,
        info: undefined,
        pending: false,
        isSafeOwned: false,
        isSafeSigner: false,
        unsupportedOwner: false,
        canManage:
          !!owner &&
          !!auth.session?.address &&
          auth.session.address.toLowerCase() === owner.toLowerCase(),
      };
    },
  };
});
vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: mocks.authenticated ? (mocks.sessionAddress as `0x${string}`) : undefined,
  }),
  useClient: () => undefined,
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({
    data: mocks.detail,
    isError: mocks.detailError,
    refetch: mocks.refetchDetail,
  }),
}));

vi.mock("#/features/reviews/hooks/use-voucher-reviews", () => ({
  useReviewSummary: () => ({ summary: mocks.reviewSummary }),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: mocks.authenticated,
    isLoading: mocks.authLoading,
    session: mocks.authenticated ? { address: mocks.sessionAddress } : null,
  }),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({
    tokens:
      mocks.balance === "0"
        ? []
        : [
            {
              tokenAddress: VOUCHER,
              tokenSymbol: "MALII",
              tokenDecimals: mocks.balanceDecimals,
              balance: mocks.balance,
            },
          ],
    isPending: mocks.balancePending,
    isError: mocks.balanceError,
    refetch: mocks.refetchBalance,
  }),
  useAccountTransfersInfinite: () => ({
    data: { pages: [{ transfers: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: (target: unknown) => {
    mocks.maps.push(target);
    return true;
  },
}));

vi.mock("#/components/vouchers/voucher-offerings-panel", () => ({
  VoucherOfferingsPanel: ({ manualPageSize }: { manualPageSize?: number }) => (
    <div data-testid="offerings" data-page-size={manualPageSize}>
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
  mocks.authLoading = false;
  mocks.balance = "0";
  mocks.balanceDecimals = 6;
  mocks.balancePending = false;
  mocks.balanceError = false;
  mocks.refetchBalance.mockReset();
  mocks.reviewSummary = { total: 0, average: 0 };
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
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
          url: `${window.location.origin}/vouchers/${VOUCHER}`,
        }),
      );
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });

  it("falls back to copying the canonical page link when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    try {
      renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/vouchers/${VOUCHER}`),
      );
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Link copied");
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("reports unavailable and rejected clipboard fallbacks", async () => {
    const missingClipboard = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(mocks.toastError).toHaveBeenCalledWith("Couldn't copy link");
    missingClipboard.unmount();

    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    try {
      renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2));
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("leaves Share unchanged when native sharing is cancelled", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(share).toHaveBeenCalledOnce());
      expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });

  it("offers an explicit copy after native sharing fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("share failed"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    try {
      renderSheet();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      const copy = await screen.findByRole("button", { name: "Copy link" });
      fireEvent.click(copy);
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/vouchers/${VOUCHER}`),
      );
    } finally {
      Reflect.deleteProperty(navigator, "share");
      Reflect.deleteProperty(navigator, "clipboard");
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
    const actions = screen.getByLabelText("Voucher actions");
    const addToCatalog = within(actions).getByRole("button", { name: "Add to catalog" });
    // Compact like the pills beside it, with the same padded 44px target.
    expect(addToCatalog.getAttribute("data-size")).toBeNull();
    expect(addToCatalog.getAttribute("data-tap")).toBe("true");
    expect(screen.getByLabelText("Your Balance").textContent).toContain("2.5 MALII (25 KSH)");
  });

  it("shows a verified zero, loading, and retryable unavailable balance without guessing", () => {
    mocks.detail = detail();
    mocks.authenticated = true;

    const zero = renderSheet();
    expect(screen.getByLabelText("Your Balance").textContent).toContain("0 MALII (0 KSH)");
    zero.unmount();

    mocks.balancePending = true;
    const loading = renderSheet();
    expect(screen.getByLabelText("Your Balance").textContent).toContain("Loading");
    loading.unmount();

    mocks.balancePending = false;
    mocks.balanceError = true;
    renderSheet();
    expect(screen.getByLabelText("Your Balance").textContent).toContain("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchBalance).toHaveBeenCalledOnce();
  });

  it.each([
    ["not-raw", 6],
    ["1", -1],
    ["1", 1.5],
  ])("rejects an invalid indexed balance of %s with %s decimals", (balance, decimals) => {
    mocks.detail = detail();
    mocks.authenticated = true;
    mocks.balance = balance;
    mocks.balanceDecimals = decimals;

    renderSheet();

    expect(screen.getByLabelText("Your Balance").textContent).toContain("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchBalance).toHaveBeenCalledOnce();
  });

  it("shows the exact token balance without inventing a value when claim metadata is incomplete", () => {
    mocks.detail = detail({ voucherValue: null, voucherUoa: null });
    mocks.authenticated = true;
    mocks.balance = "2500000";

    renderSheet();

    const balance = screen.getByLabelText("Your Balance");
    expect(balance.textContent).toContain("2.5 MALII");
    expect(balance.textContent).not.toContain("KSH");
  });

  it("does not show a wallet balance to a guest", () => {
    mocks.detail = detail({ phone: "+254700000000", website: "https://example.org" });
    renderSheet();
    expect(screen.queryByLabelText("Your Balance")).toBeNull();
    expect(screen.queryByRole("button", { name: "Directions" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Call" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Website" })).toBeNull();
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
    mocks.authenticated = true;
    renderSheet();
    expect(screen.getByRole("link", { name: "Get" }).getAttribute("href")).toBe(
      `/market?scope=pools&out_voucher=${VOUCHER.toLowerCase()}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    expect(mocks.maps).toEqual([{ label: "Kilifi", lat: -3.63, lng: 39.85 }]);
  });

  it("hides Directions for an authenticated voucher without any location", () => {
    mocks.authenticated = true;
    mocks.detail = detail({ locationName: null, lat: null, lng: null });

    renderSheet({
      placeholder: { ...CATALOG, locationName: null, lat: null, lng: null },
    });

    expect(screen.queryByRole("button", { name: "Directions" })).toBeNull();
  });
});

describe("VoucherSheet continuous content", () => {
  it("mounts the shared content on first expansion and keeps it mounted after collapse", async () => {
    mocks.detail = detail();
    renderSheet();
    expect(screen.queryByText("Offerings panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(await screen.findByText("Offerings panel", undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("Reviews panel")).toBeTruthy();
    expect(screen.getByTestId("offerings").getAttribute("data-page-size")).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.getByText("Offerings panel")).toBeTruthy();
  });

  it("has no old tabs, overview, or pool carousel", async () => {
    mocks.detail = detail();
    mocks.authenticated = true;
    renderSheet({ initialSnap: "full" });
    expect(await screen.findByText("Offerings panel", undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText("Pools with this voucher")).toBeNull();
    expect(screen.getByText("Fresh vegetables from the farm.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Info" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Activity" })).toBeTruthy();
  });

  it("does not need an escape link to a second voucher implementation", async () => {
    mocks.detail = detail();
    renderSheet({ initialSnap: "half" });
    expect(await screen.findByText("Offerings panel", undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open voucher page" })).toBeNull();
  });

  it("keeps the complete Info section unmounted for a guest", async () => {
    mocks.detail = detail({
      email: "issuer@example.org",
      phone: "+254700000000",
      website: "https://example.org",
    });
    renderSheet({ initialSnap: "full" });

    expect(await screen.findByRole("heading", { name: "Info" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Fresh vegetables from the farm.")).toBeNull();
    expect(screen.queryByText("issuer@example.org")).toBeNull();
  });

  it("uses the selected voucher identity when private info omits contract metadata", async () => {
    mocks.authenticated = true;
    mocks.detail = detail({
      address: undefined as unknown as `0x${string}`,
      symbol: undefined as unknown as string,
      decimals: undefined as unknown as number,
    });
    renderSheet({ initialSnap: "full" });

    expect(await screen.findByRole("heading", { name: "Info" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy contract address" }).textContent).toContain(
      "0xAbC0…00123",
    );
  });

  it("advances through snap points from the identity header", async () => {
    const onSnapChange = vi.fn();
    renderSheet({ onSnapChange });
    const title = screen.getByRole("heading", { name: "Priscilah Malii" });
    const header = title.closest("[data-voucher-identity]");
    if (!header) throw new Error("expected the voucher identity header");
    fireEvent.click(header);
    fireEvent.click(header);
    expect(onSnapChange.mock.calls).toEqual([["half"], ["full"]]);
    expect(await screen.findByText("Reviews panel")).toBeTruthy();
  });

  it("opens fully on an identity double-click", async () => {
    const onSnapChange = vi.fn();
    renderSheet({ onSnapChange });
    const header = screen
      .getByRole("heading", { name: "Priscilah Malii" })
      .closest("[data-voucher-identity]");
    if (!header) throw new Error("expected the voucher identity header");

    fireEvent.doubleClick(header);

    expect(onSnapChange).toHaveBeenLastCalledWith("full");
    expect(await screen.findByText("Reviews panel")).toBeTruthy();
  });

  it("does not collapse when the identity header is clicked at full", () => {
    const onSnapChange = vi.fn();
    renderSheet({ initialSnap: "full", onSnapChange });
    const header = screen
      .getByRole("heading", { name: "Priscilah Malii" })
      .closest("[data-voucher-identity]");
    if (!header) throw new Error("expected the voucher identity header");

    fireEvent.click(header);

    expect(onSnapChange).not.toHaveBeenCalled();
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
