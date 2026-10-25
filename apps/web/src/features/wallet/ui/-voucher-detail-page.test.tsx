vi.mock("#/features/ownership/hooks/use-asset-owner", () => ({
  useAssetOwner: (_address: string, owner: string | null) => owner,
}));
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { ReportSummary } from "@clc/api/features/reports/client";
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
    mocks.auth.isAuthenticated ? (
      <button type="button" className={className} data-size={size} data-tap={tap}>
        Add to catalog
      </button>
    ) : null,
}));
const quotaMock = vi.hoisted(() => ({
  data: {
    vouchers: { used: 0, limit: 1, canCreate: true, unlimited: false },
    catalogs: { used: 0, limit: 1, canCreate: true, unlimited: false },
    offers: { used: 0, limit: 3, canCreate: true, unlimited: false },
    pools: { used: 0, limit: 10, canCreate: true, unlimited: false },
  },
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
const resourceUsageCalls = vi.hoisted(() => vi.fn());
vi.mock("#/hooks/use-resource-usage", () => ({
  useResourceUsage: (...args: unknown[]) => {
    resourceUsageCalls(...args);
    return quotaMock;
  },
}));

const mocks = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as string | undefined,
  auth: {
    isAuthenticated: true,
    isLoading: false,
    // The backend session, which is what authorizes an offering write. Distinct
    // from the wagmi connector address on purpose: the two can diverge.
    session: { address: "0x1111111111111111111111111111111111111111", chainId: 42220 } as
      | { address: string; chainId: number; role?: string }
      | null
      | undefined,
  },
  profile: {
    data: { avatarUrl: "https://cdn.test/profile/avatar.webp" } as
      | { avatarUrl: string }
      | undefined,
  },
  updateProfile: vi.fn(),
  createVouchers: vi.fn(),
  transferOwnership: vi.fn(),
  retireVoucher: vi.fn(),
  navigate: vi.fn(),
  delegationStatus: "delegated" as "checking" | "delegated" | "not-delegated",
  queryClient: { invalidateQueries: vi.fn() },
  detailResult: {
    data: undefined as MarketVoucherDetail | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  openDefaultMaps: vi.fn(),
  reviewSummary: { total: 0, average: 0 },
  distanceOrigin: null as { lat: number; lng: number } | null,
  offeringAddress: undefined as string | undefined,
  managedOfferingAddress: undefined as string | undefined,
  createOffering: vi.fn(),
  updateOffering: vi.fn(),
  deleteOffering: vi.fn(),
  uploadImage: vi.fn(),
  offeringsResult: {
    data: undefined as
      | {
          pages: Array<{
            offerings: Array<{
              id: string;
              voucherAddress: `0x${string}`;
              sellerAddress: `0x${string}`;
              voucherId: string;
              sourceId: null;
              voucherName: string | null;
              voucherSymbol: string | null;
              voucherDecimals: number | null;
              name: string;
              description: string;
              quantity: string;
              unit: string | null;
              unitLabel: string | null;
              frequency: "day" | "week" | "month" | "year" | null;
              pricePerUnit: string | null;
              available: boolean;
              locationName: string | null;
              geoLat: number | null;
              geoLng: number | null;
              imageUrl: string | null;
              tags: string[];
            }>;
          }>;
        }
      | undefined,
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  reportVoucher: undefined as { chainId: number; address: `0x${string}` } | undefined,
  reportsEnabled: false,
  reportsResult: {
    data: undefined as { pages: Array<{ reports: ReportSummary[] }> } | undefined,
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  transfers: [] as Array<Record<string, unknown>>,
  transfersError: false,
  transfersHaveNextPage: false,
  fetchTransfers: vi.fn(),
  refetchTransfers: vi.fn(),
}));

vi.mock("#/components/reviews/voucher-reviews-panel", () => ({
  VoucherReviewsPanel: ({ address }: { address: string }) => (
    <div data-testid="voucher-reviews" data-address={address}>
      Voucher reviews
    </div>
  ),
}));

vi.mock("#/features/reviews/hooks/use-voucher-reviews", () => ({
  useVoucherReviewSummary: () => ({ summary: mocks.reviewSummary }),
}));

vi.mock("#/features/home/hooks/use-discovery-distance-origin", () => ({
  useDiscoveryDistanceOrigin: () => mocks.distanceOrigin,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: mocks.address }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useRecipientSearch: () => ({ data: null, error: null, isPending: false }),
  useReverseRecipientResolution: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock("#/features/wallet/hooks/use-send-share", () => ({
  useSendShare: () => ({ data: null, isPending: false, isError: false }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => mocks.queryClient,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));

vi.mock("#/features/wallet/hooks/use-address-book", () => ({
  useAddressBookRecipients: () => ({ data: [] }),
}));

vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: () => mocks.profile,
}));

vi.mock("#/hooks/use-vocabulary", () => ({
  useUnitsOfAccount: () => ({
    data: [],
    isError: false,
    refetch: vi.fn(),
  }),
  useOfferingUnits: () => ({
    data: [
      "kg",
      "g",
      "litre",
      "item",
      "hour",
      "day",
      "bag",
      "unit",
      "bundle",
      "piece",
      "dozen",
      "serving",
      "trip",
      "session",
      "metre",
    ],
  }),
}));

vi.mock("#/lib/api/storage", () => ({
  isStorageConfigured: true,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    to,
    replace: _replace,
    resetScroll: _resetScroll,
    ...props
  }: {
    children: ReactNode;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
    to: string;
    replace?: boolean;
    resetScroll?: boolean;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`$${key}`, replacement),
      to,
    );
    const query = new URLSearchParams(
      Object.entries(search ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, value] as [string, string]],
      ),
    ).toString();
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    );
  },
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useNavigate: () => mocks.navigate,
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: mocks.openDefaultMaps,
}));

vi.mock("#/features/wallet/hooks/use-retire-voucher", () => ({
  useRetireVoucher: () => ({ mutateAsync: mocks.retireVoucher, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => mocks.detailResult,
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => ({
    tokens: [
      {
        id: 1,
        tokenAddress: ADDRESS,
        tokenSymbol: "MALII",
        tokenName: "Priscilah Malii",
        tokenDecimals: 2,
        balance: "1234",
        iconUrl: null,
        lastDateBlock: "2026-07-25T00:00:00Z",
      },
    ],
    isPending: false,
  }),
  useAccountTransfersInfinite: () => ({
    data: { pages: [{ transfers: mocks.transfers }] },
    isPending: false,
    isError: mocks.transfersError,
    isSuccess: !mocks.transfersError,
    hasNextPage: mocks.transfersHaveNextPage,
    isFetchingNextPage: false,
    fetchNextPage: mocks.fetchTransfers,
    refetch: mocks.refetchTransfers,
  }),
}));

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersInfinite: () => ({ data: undefined, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: (address: string | undefined) => {
    mocks.offeringAddress = address;
    return mocks.offeringsResult;
  },
  // The owner's read. Recorded separately so a test can prove which query ran:
  // a visitor must not issue this one and an owner must not issue the cached one.
  useManagedVoucherOfferingsInfinite: (address: string | undefined) => {
    mocks.managedOfferingAddress = address;
    return mocks.offeringsResult;
  },
}));

// The photo field is the shared one now, so its upload hook is what needs
// stubbing rather than an offering-specific wrapper.
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({
    mutateAsync: mocks.uploadImage,
    reset: () => {},
    isPending: false,
    isError: false,
  }),
}));

vi.mock("#/features/vouchers/hooks/use-update-voucher-profile", () => ({
  useUpdateVoucherProfile: () => ({
    mutateAsync: mocks.updateProfile,
    isPending: false,
  }),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-mint", () => ({
  useVoucherMint: () => ({ mutateAsync: mocks.createVouchers, isPending: false }),
}));

vi.mock("#/features/vouchers/hooks/use-voucher-ownership-transfer", () => ({
  useVoucherOwnershipTransfer: () => ({ mutateAsync: mocks.transferOwnership, isPending: false }),
}));

vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => mocks.delegationStatus,
}));

vi.mock("#/hooks/use-deployment", () => ({
  useTokenTags: () => ({
    data: ["Agriculture", "Food"],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// The picker geocodes and renders a map; the editor only needs it to hold a place.
vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
  }: {
    value?: { locationName: string };
    onChange: (value: undefined) => void;
  }) => (
    <button type="button" onClick={() => onChange(undefined)}>
      {value?.locationName ?? "Choose a location"}
    </button>
  ),
}));

vi.mock("#/features/wallet/hooks/use-offering-mutations", () => ({
  useCreateVoucherOffering: () => ({ mutateAsync: mocks.createOffering, isPending: false }),
  useUpdateVoucherOffering: () => ({ mutateAsync: mocks.updateOffering, isPending: false }),
  useDeleteVoucherOffering: () => ({ mutateAsync: mocks.deleteOffering, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-reports", () => ({
  useVoucherReportsInfinite: (
    voucher: { chainId: number; address: `0x${string}` } | undefined,
    _perPage: number,
    enabled: boolean,
  ) => {
    mocks.reportVoucher = voucher;
    mocks.reportsEnabled = enabled;
    return mocks.reportsResult;
  },
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="location-map" data-lat={lat} data-lng={lng} />
  ),
}));

import { VoucherDetailPage } from "./voucher-detail-page";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";
const OTHER = "0x9999999999999999999999999999999999999999";

function detail(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "2710",
    chainId: 42220,
    address: ADDRESS,
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 2,
    ownerAddress: "0xDeF0000000000000000000000000000000000456",
    description: "Fresh produce and household goods.",
    voucherUoa: "KSH",
    voucherValue: "10",
    locationName: "C96, KEN",
    lat: -1.450979,
    lng: 38.235115,
    email: "issuer@example.org",
    website: "https://example.org",
    phone: "+254700000000",
    terms: "https://example.org/terms",
    iconUrl: "https://content.example/icon.jpg",
    bannerUrl: "https://content.example/banner.jpg",
    tags: ["Agriculture"],
    kind: "goods",
    markerIcon: null,
    markerColor: null,
    active: true,
    ...overrides,
  };
}

function report(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    id: "3182",
    title: "Harvesting greengrams with Wendo group",
    description: "7 members from Wendo group helped with the harvest.",
    imageUrl: null,
    locationName: "Kitui, KEN",
    lat: -1.29,
    lng: 36.82,
    periodFrom: null,
    periodTo: null,
    createdAt: null,
    updatedAt: "2026-07-19T08:14:02.311Z",
    markerIcon: "post",
    markerColor: "pink",
    tags: ["Food production"],
    vouchers: [
      { id: "7", chainId: 42220, address: ADDRESS, name: "Priscilah Malii", symbol: "MALII" },
    ],
    pools: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.address = "0x1111111111111111111111111111111111111111";
  // A signed-in visitor who is not the issuer. Ownership tests override the
  // session; everything else reads the panel as a visitor would.
  mocks.auth = {
    isAuthenticated: true,
    isLoading: false,
    session: { address: OTHER, chainId: 42220 },
  };
  mocks.openDefaultMaps.mockReset();
  mocks.reviewSummary = { total: 0, average: 0 };
  mocks.distanceOrigin = null;
  mocks.createVouchers.mockReset();
  mocks.createVouchers.mockResolvedValue({ trackingId: "mint-1" });
  mocks.transferOwnership.mockReset();
  mocks.transferOwnership.mockResolvedValue({ trackingId: "owner-1" });
  mocks.delegationStatus = "delegated";
  mocks.queryClient.invalidateQueries.mockReset();
  mocks.detailResult = {
    data: detail(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  mocks.offeringAddress = undefined;
  mocks.offeringsResult = {
    data: {
      pages: [
        {
          offerings: [
            {
              id: "1",
              sourceId: null,
              voucherId: "10",
              voucherAddress: ADDRESS,
              voucherName: "Priscilah Malii",
              voucherSymbol: "MALII",
              voucherDecimals: 2,
              sellerAddress: "0x1111111111111111111111111111111111111111",
              name: "Vegetables",
              description: "Fresh produce",
              quantity: "5",
              unit: "kg",
              unitLabel: "kg",
              frequency: "week",
              pricePerUnit: "10",
              available: true,
              locationName: "Kangemi Market",
              geoLat: null,
              geoLng: null,
              imageUrl: "https://content.example/vegetables.jpg",
              tags: ["Produce", "Fresh"],
            },
            {
              id: "2",
              sourceId: null,
              voucherId: "10",
              voucherAddress: ADDRESS,
              voucherName: "Priscilah Malii",
              voucherSymbol: "MALII",
              voucherDecimals: 2,
              sellerAddress: "0x1111111111111111111111111111111111111111",
              name: "Farm training",
              description: "",
              quantity: "1000000000",
              unit: null,
              unitLabel: null,
              frequency: null,
              pricePerUnit: null,
              available: true,
              locationName: null,
              geoLat: null,
              geoLng: null,
              imageUrl: null,
              tags: [],
            },
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
  mocks.reportVoucher = undefined;
  mocks.transfers = [];
  mocks.transfersError = false;
  mocks.transfersHaveNextPage = false;
  mocks.fetchTransfers.mockReset();
  mocks.refetchTransfers.mockReset();
  mocks.reportsEnabled = false;
  mocks.reportsResult = {
    data: { pages: [{ reports: [report()] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoucherDetailPage", () => {
  it("returns a related voucher to its source Post", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} origin="posts" reportId="3182" />);

    expect(screen.getByRole("link", { name: "Posts" }).getAttribute("href")).toBe("/posts/3182");
  });

  it("shows voucher creation as new supply without exposing the zero address", async () => {
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    mocks.transfers = [
      {
        id: 743840,
        txHash: "0xec0810051bdd353f0d3ad60bdf6c78eef8579d8d4b19d1bd7bc4f6a73cc16783",
        dateBlock: "2026-09-30T05:27:30Z",
        direction: "IN",
        counterpartyAddress: zeroAddress,
        senderAddress: zeroAddress,
        recipientAddress: mocks.address,
        tokenAddress: ADDRESS,
        tokenSymbol: "MALII",
        tokenName: "Priscilah Malii",
        tokenDecimals: 2,
        amount: "100000",
        success: true,
      },
    ];

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="activity" />);

    expect(await screen.findByText("Created")).toBeTruthy();
    expect(screen.getByText(/New supply/)).toBeTruthy();
    expect(screen.getByText("1000 MALII")).toBeTruthy();
    expect(document.body.textContent).not.toContain("0x0000");
  });

  it("shows the immutable Unit-of-Account snapshot in voucher activity", async () => {
    mocks.transfers = [
      {
        id: 743841,
        txHash: `0x${"12".repeat(32)}`,
        dateBlock: "2026-09-30T05:27:30Z",
        direction: "OUT",
        counterpartyAddress: "0x2222222222222222222222222222222222222222",
        senderAddress: mocks.address,
        recipientAddress: "0x2222222222222222222222222222222222222222",
        tokenAddress: ADDRESS,
        tokenSymbol: "MALII",
        tokenName: "Priscilah Malii",
        tokenDecimals: 2,
        amount: "1000",
        success: true,
        uoaValue: "125.5",
        uoa: "KES",
      },
    ];

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="activity" />);

    expect(await screen.findByText("Sent")).toBeTruthy();
    expect(screen.getByText("10 MALII")).toBeTruthy();
    expect(screen.getByText("(125.50 KES)")).toBeTruthy();
  });

  it("loads more Activity only after an explicit request", () => {
    mocks.transfersHaveNextPage = true;

    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(mocks.fetchTransfers).not.toHaveBeenCalled();
    fireEvent.click(within(activity).getByRole("button", { name: "Load more" }));
    expect(mocks.fetchTransfers).toHaveBeenCalledOnce();
  });

  it("retries failed Activity without affecting the other voucher sections", () => {
    mocks.transfersError = true;
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="activity" />);

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getByText("Couldn't load activity.")).toBeTruthy();
    fireEvent.click(within(activity).getByRole("button", { name: "Try again" }));
    expect(mocks.refetchTransfers).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Info" })).toBeTruthy();
  });

  it("reveals local Activity rows in batches and clears the selected details on close", async () => {
    const baseTransfer = {
      id: 1,
      txHash: `0x${"12".repeat(32)}`,
      dateBlock: "2026-09-30T05:27:30Z",
      direction: "OUT",
      counterpartyAddress: "0x2222222222222222222222222222222222222222",
      senderAddress: mocks.address,
      recipientAddress: "0x2222222222222222222222222222222222222222",
      tokenAddress: ADDRESS,
      tokenSymbol: "MALII",
      tokenName: "Priscilah Malii",
      tokenDecimals: 2,
      amount: "100",
      success: true,
    };
    mocks.transfers = [1, 2, 3, 4].map((id) => ({
      ...baseTransfer,
      id,
      txHash: `0x${String(id).padStart(64, "0")}`,
      amount: String(id * 100),
    }));
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="activity" />);

    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).queryByText("4 MALII")).toBeNull();
    fireEvent.click(within(activity).getByRole("button", { name: "Load more" }));
    expect(within(activity).getByText("4 MALII")).toBeTruthy();

    fireEvent.click(within(activity).getAllByRole("button")[0]!);
    expect(screen.getByRole("dialog", { name: "Transaction details" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Transaction details" })).toBeNull(),
    );
  });

  it("puts the map-style summary and actions above continuous sections", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByRole("heading", { name: "Priscilah Malii" })).toBeTruthy();
    expect(screen.getByLabelText("Your Balance").textContent).toContain("12.34 MALII (123.4 KSH)");
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "0 out of 5 stars" })).toBeTruthy();
    expect(screen.getByText("Agriculture")).toBeTruthy();

    const actions = screen.getByLabelText("Voucher actions");
    expect(actions.textContent).toBe("GetSendRedeemDirectionsCallWebsiteAdd to catalog");
    const addToCatalog = within(actions).getByRole("button", { name: "Add to catalog" });
    // Compact like the pills beside it, with the same padded 44px target.
    expect(addToCatalog.getAttribute("data-size")).toBeNull();
    expect(addToCatalog.getAttribute("data-tap")).toBe("true");
    expect(within(actions).getByRole("link", { name: "Get" }).getAttribute("href")).toBe(
      `/market?scope=pools&out_voucher=${ADDRESS.toLowerCase()}`,
    );
    const redeem = within(actions).getByRole("link", { name: "Redeem" });
    expect(redeem.getAttribute("data-variant")).toBe("outline");
    expect(redeem.getAttribute("href")).toBe(
      `/wallet/send/amount?token=${ADDRESS}&recipient=0xDeF0000000000000000000000000000000000456`,
    );
    expect(within(actions).queryByRole("link", { name: "Pools" })).toBeNull();

    expect(screen.queryByRole("tab")).toBeNull();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Offerings", "Reviews", "Posts", "Info", "Activity"]);
    const offerings = screen.getByRole("region", { name: "Offerings" });
    expect(within(offerings).getByText("Vegetables")).toBeTruthy();
    // Price per unit, as one message: the unit is part of what the figure means.
    expect(within(offerings).getByText("100 KSH / kg")).toBeTruthy();
    expect(within(offerings).getByText("Price on request")).toBeTruthy();
    expect(
      within(offerings).getByText(
        (_content, element) =>
          element?.tagName === "SPAN" && element.textContent === "5 kg · Weekly",
      ),
    ).toBeTruthy();
    expect(within(offerings).getByText("1B")).toBeTruthy();
    expect(offerings.querySelector(".grid")?.className).toContain("grid-cols-2");
    // Every image is pinned to one height and cannot absorb a stretched row's
    // slack, so two tiles with different amounts of text still line up.
    expect(
      Array.from(offerings.querySelectorAll('[data-slot="offering-media"]')).every(
        (media) => media.className.includes("h-36") && media.className.includes("shrink-0"),
      ),
    ).toBe(true);
    expect(
      Array.from(offerings.querySelectorAll('[data-slot="offering-media"]')).every((media) =>
        media.parentElement?.className.includes("flex-col"),
      ),
    ).toBe(true);
    expect(
      within(offerings).getAllByRole("button", { name: /View offering details:/ }),
    ).toHaveLength(2);
    expect(screen.queryByText("Fresh produce")).toBeNull();

    fireEvent.click(
      within(offerings).getByRole("button", {
        name: "View offering details: Vegetables",
      }),
    );

    const dialog = screen.getByRole("dialog");
    // The description is the value alone — no "Description" key above it — but
    // it gets its own card rather than floating on the sheet background.
    const description = within(dialog).getByText("Fresh produce");
    expect(within(dialog).queryByText("Description")).toBeNull();
    expect(description.parentElement?.className).toContain("bg-card");
    expect(description.parentElement?.className).toContain("border-border");
    // Redundant with the voucher itself.
    expect(within(dialog).queryByText("Kangemi Market")).toBeNull();
    expect(within(dialog).queryByText("Seller")).toBeNull();
    // Tapping outside dismisses, so the only close control is screen-reader only.
    expect(within(dialog).getByText("Close").className).toContain("sr-only");
  });

  it("shows the voucher rating, at most three tags, and the location fallback", () => {
    mocks.reviewSummary = { total: 10, average: 4.4 };
    mocks.detailResult.data = detail({ tags: ["Food", "Farming", "Local", "Extra"] });

    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    expect(screen.getByRole("img", { name: "4.4 out of 5 stars" })).toBeTruthy();
    expect(screen.getByText("(10)")).toBeTruthy();
    expect(screen.getAllByText("C96, KEN").length).toBeGreaterThan(0);
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Farming")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
    expect(screen.queryByText("Extra")).toBeNull();
  });

  it("uses the trustworthy discovery origin for the compact distance", () => {
    mocks.distanceOrigin = { lat: -1.450979, lng: 38.235115 };

    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    expect(
      screen.getByRole("img", { name: "0 out of 5 stars" }).parentElement?.textContent,
    ).toContain("0 m");
  });

  it("shares the canonical voucher page without origin or legacy tab state", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" origin="wallet" />);
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          title: "Priscilah Malii",
          url: `${window.location.origin}/vouchers/${ADDRESS}`,
        }),
      );
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });

  it("reveals offerings three at a time without auto-loading past later sections", () => {
    const page = mocks.offeringsResult.data?.pages[0];
    const first = page?.offerings[0];
    if (!page || !first) throw new Error("expected offering fixtures");
    page.offerings.push(
      { ...first, id: "3", name: "Third offering" },
      { ...first, id: "4", name: "Fourth offering" },
    );

    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    const offerings = screen.getByRole("region", { name: "Offerings" });
    expect(
      within(offerings).getAllByRole("button", { name: /View offering details:/ }),
    ).toHaveLength(3);
    expect(within(offerings).queryByText("Fourth offering")).toBeNull();
    fireEvent.click(within(offerings).getByRole("button", { name: "Load more" }));
    expect(within(offerings).getByText("Fourth offering")).toBeTruthy();
    expect(within(offerings).queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("hides Send and Redeem for guests while keeping public actions", () => {
    mocks.auth = { isAuthenticated: false, isLoading: false, session: null };

    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    const actions = screen.getByLabelText("Voucher actions");
    expect(within(actions).getByRole("link", { name: "Get" })).toBeTruthy();
    expect(within(actions).queryByRole("link", { name: "Send" })).toBeNull();
    expect(within(actions).queryByRole("link", { name: "Redeem" })).toBeNull();
  });

  it("colours each tag from its own name so a tag looks the same everywhere", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Vegetables" }));

    const dialog = screen.getByRole("dialog");
    const produce = within(dialog).getByText("Produce");
    const fresh = within(dialog).getByText("Fresh");

    expect(produce.style.backgroundColor).toBeTruthy();
    expect(fresh.style.backgroundColor).toBeTruthy();
    expect(produce.style.backgroundColor).not.toBe(fresh.style.backgroundColor);
  });

  it("keeps the offering rollup informational and closes it onto the voucher page", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Vegetables" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("100 KSH / kg")).toBeTruthy();
    expect(within(dialog).queryByText("Quantity")).toBeNull();
    expect(within(dialog).queryByText("Total")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Add to cart/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Open voucher page" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the unit-of-account price and hides a new offering's synthetic quantity", () => {
    mocks.detailResult.data = detail({ voucherUoa: "KES", voucherValue: "1" });
    const offering = mocks.offeringsResult.data?.pages[0]?.offerings[0];
    if (!offering) throw new Error("expected offering fixture");
    offering.pricePerUnit = "600";
    offering.quantity = "1";
    offering.unit = "hour";
    offering.unitLabel = "hour";

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    const panel = screen.getByRole("region", { name: "Offerings" });
    expect(within(panel).getByText("600 KES / hour")).toBeTruthy();
    expect(within(panel).queryByText("1 hour")).toBeNull();

    fireEvent.click(
      within(panel).getByRole("button", { name: "View offering details: Vegetables" }),
    );
    expect(within(screen.getByRole("dialog")).getByText("600 KES / hour")).toBeTruthy();
  });

  it("shows no total for an offering the issuer never priced", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Farm training" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Price on request")).toBeTruthy();
    expect(within(dialog).queryByText("Total")).toBeNull();
    expect(within(dialog).queryByText("Quantity")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Open voucher page" })).toBeTruthy();
  });

  it("hides Redeem when the voucher has no known issuer to send back to", () => {
    mocks.detailResult.data = detail({ ownerAddress: null });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    const actions = screen.getByLabelText("Voucher actions");
    expect(within(actions).queryByRole("link", { name: "Redeem" })).toBeNull();
    expect(within(actions).queryByRole("button", { name: "Redeem" })).toBeNull();
  });

  it("loads offerings for a generic voucher instead of inferring an empty list", () => {
    mocks.detailResult.data = detail({ kind: "voucher" });

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByText("Vegetables")).toBeTruthy();
    expect(mocks.offeringAddress).toBe(ADDRESS);
  });

  it("offers a working retry when offerings fail to load", () => {
    const refetch = vi.fn();
    mocks.offeringsResult = {
      ...mocks.offeringsResult,
      data: undefined,
      isError: true,
      isSuccess: false,
      refetch,
    };

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByText("Couldn't load offerings.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows zero when the account has no balance for the voucher", () => {
    const unheldAddress = "0x9990000000000000000000000000000000000999";
    mocks.detailResult.data = detail({ address: unheldAddress });
    render(<VoucherDetailPage voucherAddress={unheldAddress} activeTab="offerings" />);

    expect(screen.getByLabelText("Your Balance").textContent).toContain("0 MALII (0 KSH)");
  });

  it("keeps the profile image hidden behind a skeleton until load and omits the banner", () => {
    const { container } = render(
      <VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />,
    );
    const avatar = container.querySelector(
      'img[src="https://content.example/icon.jpg"]',
    ) as HTMLImageElement;

    expect(container.querySelector('img[src="https://content.example/banner.jpg"]')).toBeNull();
    expect(avatar.getAttribute("loading")).toBe("lazy");
    expect(avatar.dataset.state).toBe("loading");
    expect(avatar.parentElement?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);

    fireEvent.load(avatar);

    expect(avatar.dataset.state).toBe("loaded");
    expect(avatar.parentElement?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });

  it("removes a failed offering image instead of leaving a broken image glyph", () => {
    const { container } = render(
      <VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />,
    );
    const offeringImage = container.querySelector(
      'img[src="https://content.example/vegetables.jpg"]',
    ) as HTMLImageElement;

    fireEvent.error(offeringImage);

    expect(container.querySelector('img[src="https://content.example/vegetables.jpg"]')).toBeNull();
    expect(container.querySelector('[data-slot="offering-media"]')?.textContent).toContain("V");
  });

  it("separates UOA, description, metadata, and location into purpose-built info surfaces", () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: clipboardWrite } });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    const panel = screen.getByRole("region", { name: "Info" });
    expect(within(panel).queryByRole("link", { name: "Find this voucher in a pool" })).toBeNull();
    const rate = within(panel).getByText("1 MALII = 10 KSH");
    expect(rate.className).toContain("text-sm");
    expect(rate.className).toContain("text-primary");
    expect(screen.queryByText("Description")).toBeNull();
    const description = screen.getByText("Fresh produce and household goods.");
    expect(description.parentElement).toBe(rate.parentElement);
    expect(description.parentElement?.className).toContain("bg-card");

    const labels = Array.from(panel.querySelectorAll("dt"), (node) => node.textContent);
    expect(labels).toEqual(["Contract address", "Email", "Website", "Phone", "Terms", "Issuer"]);
    expect(
      Array.from(panel.querySelectorAll("dl > div")).every((row) => row.className.includes("h-12")),
    ).toBe(true);

    const copy = screen.getByRole("button", { name: "Copy contract address" });
    expect(copy.textContent).toContain("…");
    fireEvent.click(copy);
    expect(clipboardWrite).toHaveBeenCalledWith(ADDRESS);

    expect(screen.getByText("issuer@example.org").getAttribute("href")).toBe(
      "mailto:issuer@example.org",
    );
    const website = screen.getByText("https://example.org");
    expect(website.getAttribute("target")).toBe("_blank");
    expect(website.getAttribute("rel")).toContain("noopener");
    const terms = screen.getByText("https://example.org/terms");
    expect(terms.getAttribute("href")).toBe("https://example.org/terms");
    expect(terms.getAttribute("target")).toBe("_blank");

    const location = within(panel).getByText("C96, KEN");
    expect(location.className).toContain("text-sm");
    const openMaps = screen.getByRole("button", { name: "Open in Maps" });
    expect(
      location.compareDocumentPosition(openMaps) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("Map")).toBeNull();
    expect(screen.getByTestId("location-map").dataset).toMatchObject({
      lat: "-1.450979",
      lng: "38.235115",
    });

    fireEvent.click(openMaps);
    expect(mocks.openDefaultMaps).toHaveBeenCalledWith({
      label: "C96, KEN",
      lat: -1.450979,
      lng: 38.235115,
    });
  });

  it("renders terms written by the issuer as Markdown in their own panel", () => {
    mocks.detailResult.data = detail({
      terms: "# House rules\n\nRedeemable at the **Saturday** market only.",
    });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    const panel = screen.getByRole("region", { name: "Info" });
    const labels = Array.from(panel.querySelectorAll("dt"), (node) => node.textContent);
    expect(labels).not.toContain("Terms");
    expect(screen.getByRole("heading", { name: "House rules" })).toBeTruthy();
    expect(screen.getByText("Saturday").tagName).toBe("STRONG");
    expect(screen.getByText("Terms").closest("div")?.className).toContain("bg-card");
  });

  it("omits absent email and phone rows", () => {
    mocks.detailResult.data = detail({ email: null, phone: null });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    const panel = screen.getByRole("region", { name: "Info" });
    expect(within(panel).queryByText("Email")).toBeNull();
    expect(within(panel).queryByText("Phone")).toBeNull();
    expect(within(panel).getByText("Website")).toBeTruthy();
  });

  it("uses a deliberate fallback instead of broken image elements", () => {
    mocks.detailResult.data = detail({ bannerUrl: null, iconUrl: null });
    const { container } = render(
      <VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />,
    );

    expect(container.querySelector('img[src="https://content.example/icon.jpg"]')).toBeNull();
    expect(container.textContent).toContain("MA");
  });

  it("preserves Reviews alongside Posts in the continuous page", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="reviews" />);

    expect(screen.getByText("Voucher reviews")).toBeTruthy();
    expect(screen.getByTestId("voucher-reviews").getAttribute("data-address")).toBe(ADDRESS);
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("renders only this voucher's posts in the Posts section", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(mocks.reportVoucher).toEqual({ chainId: 42220, address: ADDRESS });
    expect(mocks.reportsEnabled).toBe(true);
    const panel = screen.getByRole("heading", { name: "Posts" }).closest("section");
    if (!panel) throw new Error("expected Posts section");
    expect(within(panel).getByText("Harvesting greengrams with Wendo group")).toBeTruthy();
    expect(
      within(panel)
        .getByRole("link", { name: /Harvesting greengrams/ })
        .getAttribute("href"),
    ).toBe("/posts/3182");
  });

  // A post may only link vouchers its author owns, so the button that seeds
  // one is for the issuer and superadmins; a visitor reads the tab without it.
  it("offers Write a post to the issuer and to a superadmin, not to a visitor", () => {
    const asVisitor = render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);
    expect(screen.queryByRole("link", { name: "Write a post" })).toBeNull();
    asVisitor.unmount();

    mocks.auth.session = { address: OTHER, chainId: 42220, role: "SUPERADMIN" };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);
    expect(screen.getByRole("link", { name: "Write a post" })).toBeTruthy();
  });

  it("opens the post editor with this voucher already linked", () => {
    mocks.auth.session = { address: "0xDeF0000000000000000000000000000000000456", chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    const href = screen.getByRole("link", { name: "Write a post" }).getAttribute("href");
    expect(href?.startsWith("/posts/new?")).toBe(true);
    const search = new URLSearchParams(href?.slice(href.indexOf("?")));
    expect(search.get("voucher")).toBe(ADDRESS);
    expect(search.get("chainId")).toBe("42220");
    expect(search.get("voucherName")).toBe("Priscilah Malii");
  });

  it("shows an empty state when the voucher has no related posts", () => {
    mocks.reportsResult.data = { pages: [{ reports: [] }] };

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(screen.getByText("No posts yet.")).toBeTruthy();
  });

  it("shows a loading state while related posts are requested", () => {
    mocks.reportsResult = {
      ...mocks.reportsResult,
      data: undefined,
      isPending: true,
      isSuccess: false,
    };

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(screen.getByText("Loading posts…")).toBeTruthy();
  });

  it("loads the next related-post page only after an explicit request", () => {
    mocks.reportsResult.hasNextPage = true;

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(mocks.reportsResult.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]!);
    expect(mocks.reportsResult.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("offers a retry when related posts fail to load", () => {
    const refetch = vi.fn();
    mocks.reportsResult = {
      ...mocks.reportsResult,
      data: undefined,
      isError: true,
      isSuccess: false,
      refetch,
    };

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(screen.getByText("Couldn't load posts.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("does not request related posts for a guest", () => {
    mocks.auth = { isAuthenticated: false, isLoading: false, session: null };

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(mocks.reportsEnabled).toBe(false);
    expect(screen.getByText("Sign in to view posts.")).toBeTruthy();
  });

  it("does not guess a chain when voucher detail omits it", () => {
    mocks.detailResult.data = detail({ chainId: null });

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(mocks.reportVoucher).toBeUndefined();
    expect(mocks.reportsEnabled).toBe(false);
    expect(screen.getByText("Posts aren't available for this voucher.")).toBeTruthy();
  });
});

/**
 * The owner's view of their own offerings.
 *
 * Two things separate it from a visitor's, and each has a reason that is not
 * cosmetic: the controls, and which query runs. The cached public read is right
 * for browsing and wrong for the person editing the list, because the endpoint
 * lets the browser keep the pre-mutation body for up to a minute.
 */
describe("VoucherOfferingsPanel ownership", () => {
  const OWNER = "0xDeF0000000000000000000000000000000000456";

  beforeEach(() => {
    mocks.offeringAddress = undefined;
    mocks.managedOfferingAddress = undefined;
    mocks.createOffering.mockReset();
    mocks.updateOffering.mockReset();
    mocks.deleteOffering.mockReset();
    mocks.deleteOffering.mockResolvedValue("1");
    resourceUsageCalls.mockClear();
  });

  it("gives the voucher's owner add, edit and remove controls", () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    const offerings = screen.getByRole("region", { name: "Offerings" });
    expect(screen.getByRole("button", { name: "Add offering" })).toBeTruthy();
    expect(within(offerings).getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
    expect(within(offerings).getAllByRole("button", { name: "Remove" }).length).toBeGreaterThan(0);
    expect(resourceUsageCalls.mock.calls.length).toBeGreaterThan(0);
    expect(resourceUsageCalls.mock.calls.every((call) => call[1] === ADDRESS)).toBe(true);
  });

  it("reads through the uncached query for an owner and the cached one for a visitor", () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);
    expect(mocks.managedOfferingAddress).toBe(ADDRESS);
    // Not both: the owner must not also hold a cached copy that a write cannot
    // reliably refresh.
    expect(mocks.offeringAddress).toBeUndefined();
  });

  it.each([
    [
      "another signed-in user",
      { isAuthenticated: true, isLoading: false, session: { address: OTHER, chainId: 42220 } },
    ],
    ["a guest", { isAuthenticated: false, isLoading: false, session: null }],
    // A session cookie is what the write is authorized against, so a connected
    // wallet with no session is a visitor here.
    [
      "a connected wallet with no session",
      { isAuthenticated: false, isLoading: false, session: undefined },
    ],
  ])("keeps the panel read-only for %s", (_label, auth) => {
    Object.assign(mocks.auth, auth);
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.queryByRole("button", { name: "Add offering" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(mocks.managedOfferingAddress).toBeUndefined();
  });

  // A voucher with no recorded owner has nobody to authorize, so nobody gets
  // controls — the two nulls must not compare equal.
  it("gives nobody controls when the catalog records no owner", () => {
    mocks.detailResult.data = detail({ ownerAddress: null });
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.queryByRole("button", { name: "Add offering" })).toBeNull();
  });

  // Case-folded: the catalog stores the address lower-cased while a session
  // claim is checksummed.
  it("matches the owner regardless of address casing", () => {
    mocks.detailResult.data = detail({
      ownerAddress: OWNER.toLowerCase() as MarketVoucherDetail["ownerAddress"],
    });
    mocks.auth.session = { address: OWNER.toUpperCase(), chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByRole("button", { name: "Add offering" })).toBeTruthy();
  });

  // The owner needs somewhere to add the first offering, so the shortcut that is
  // sound for a visitor must not suppress their query.
  it("loads managed offerings for an owner of a generic voucher", () => {
    mocks.detailResult.data = detail({
      ownerAddress: OWNER as MarketVoucherDetail["ownerAddress"],
      kind: "voucher",
    });
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(mocks.managedOfferingAddress).toBe(ADDRESS);
    expect(screen.getByRole("button", { name: "Add offering" })).toBeTruthy();
  });

  it("asks before removing, and calls the mutation once confirmed", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    const remove = within(screen.getByRole("region", { name: "Offerings" })).getAllByRole(
      "button",
      {
        name: "Remove",
      },
    )[0];
    fireEvent.click(remove as HTMLElement);
    expect(confirm).toHaveBeenCalled();
    expect(mocks.deleteOffering).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(remove as HTMLElement);
    });
    expect(mocks.deleteOffering).toHaveBeenCalledWith("1");
  });

  it("opens the editor sheet on Add", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add offering" }));
    });

    expect(screen.getByRole("heading", { name: "Add offering" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "A good" })).toBeNull();
    expect(screen.queryByRole("button", { name: "A service" })).toBeNull();
    // Price and unit share a line under one label, so the unit control carries
    // its own name.
    expect(screen.getByLabelText("Price per unit in KSH")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Unit" })).toBeTruthy();
  });

  it("uses the voucher's chosen currency and the issuer's profile photo by default", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    mocks.detailResult.data = detail({ voucherUoa: "KES" });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add offering" }));
    });

    expect(screen.getByLabelText("Price per unit in KES")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update photo" })).toBeTruthy();
    expect(
      document.body.querySelector('img[src="https://cdn.test/profile/avatar.webp"]'),
    ).toBeTruthy();
  });

  it("publishes without a classification field or default", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getByRole("button", { name: "Add offering" }));

    fireEvent.change(screen.getByLabelText("What are you offering?"), {
      target: { value: "Fresh flour" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Stone-ground flour" },
    });
    fireEvent.change(screen.getByLabelText("Price per unit in KSH"), {
      target: { value: "120.50" },
    });
    fireEvent.focus(screen.getByRole("combobox", { name: "Unit" }));
    fireEvent.click(screen.getByRole("option", { name: "Kilogram" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish offering" }));
    });

    expect(mocks.createOffering.mock.calls[0]?.[0]).not.toHaveProperty("commodityType");
    expect(mocks.createOffering).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Fresh flour",
        unit: "kg",
        pricePerUnit: "120.50",
      }),
    );
  });

  it("saves edits without a classification field", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);

    expect(screen.queryByRole("button", { name: "A service" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Hands-on farm training" },
    });
    fireEvent.change(screen.getByLabelText("Price per unit in KSH"), {
      target: { value: "250" },
    });
    fireEvent.focus(screen.getByRole("combobox", { name: "Unit" }));
    fireEvent.click(screen.getByRole("option", { name: "Hour" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    });

    expect(mocks.updateOffering.mock.calls[0]?.[0].input).not.toHaveProperty("commodityType");
    expect(mocks.updateOffering).toHaveBeenCalledWith({
      id: "2",
      input: expect.objectContaining({ unit: "hour" }),
    });
  });

  it("searches the units instead of listing fifteen chips", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add offering" }));
    });

    // Closed, the list offers nothing — the fifteen units are behind a search.
    expect(screen.queryByRole("option", { name: "Kilogram" })).toBeNull();

    const unit = screen.getByRole("combobox", { name: "Unit" });
    await act(async () => {
      fireEvent.focus(unit);
    });
    await act(async () => {
      fireEvent.change(unit, { target: { value: "kilo" } });
    });

    const option = screen.getByRole("option", { name: "Kilogram" });
    expect(screen.queryByRole("option", { name: "Session" })).toBeNull();

    await act(async () => {
      fireEvent.click(option);
    });
    expect((unit as HTMLInputElement).value).toBe("Kilogram");
  });

  // The fifteen units are a starting point, not the whole world. A seller whose
  // measure nobody seeded types it and keeps it.
  it("lets the seller keep a measure the list does not have", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add offering" }));
    });

    const unit = screen.getByRole("combobox", { name: "Unit" });
    await act(async () => {
      fireEvent.focus(unit);
    });
    await act(async () => {
      fireEvent.change(unit, { target: { value: "produce   crate" } });
    });

    // Title Case is the one spelling the backend stores, so it is the one the
    // seller is offered.
    const create = screen.getByRole("button", { name: /Produce Crate/ });
    await act(async () => {
      fireEvent.click(create);
    });

    // The value is not in the option list, and the closed field still shows it.
    expect((unit as HTMLInputElement).value).toBe("Produce Crate");
  });

  it("does not offer to create a unit the list already spells", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add offering" }));
    });

    const unit = screen.getByRole("combobox", { name: "Unit" });
    await act(async () => {
      fireEvent.focus(unit);
    });
    await act(async () => {
      fireEvent.change(unit, { target: { value: "Kilogram" } });
    });

    expect(screen.queryByRole("button", { name: /^Use/ })).toBeNull();
  });
});

describe("VoucherDetailPage voucher details editor", () => {
  const OWNER = "0xDeF0000000000000000000000000000000000456";
  const savedProfile = {
    description: "Fresh produce and household goods.",
    voucherUoa: "KSH",
    voucherValue: 10,
    email: "issuer@example.org",
    website: "https://example.org",
    phone: "+254700000000",
    terms: "https://example.org/terms",
    locationName: "C96, KEN",
    geoLat: -1.450979,
    geoLng: 38.235115,
    tags: ["Agriculture"],
  };

  beforeEach(() => {
    mocks.updateProfile.mockReset();
    mocks.updateProfile.mockResolvedValue(detail({ name: "Malii Fresh" }));
  });

  it("offers the continuous Info editor only to the voucher's owner", () => {
    mocks.auth.session = { address: OTHER, chainId: 42220 };
    const stranger = render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
    stranger.unmount();

    mocks.auth.session = { address: OWNER.toUpperCase(), chainId: 42220 };
    const owner = render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
    owner.unmount();

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("lets a superadmin edit a voucher they do not own", () => {
    mocks.auth.session = { address: OTHER, chainId: 42220, role: "SUPERADMIN" };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("opens the stored record in a sheet and saves the whole profile", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.queryByLabelText("Display name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Display name") as HTMLInputElement;
    expect(name.value).toBe("Priscilah Malii");
    expect(
      (within(dialog).getByLabelText("Voucher Description") as HTMLTextAreaElement).value,
    ).toBe("Fresh produce and household goods.");
    expect((within(dialog).getByLabelText("Terms URL") as HTMLInputElement).value).toBe(
      "https://example.org/terms",
    );
    expect(within(dialog).getByText("C96, KEN")).toBeTruthy();

    fireEvent.change(name, { target: { value: "Malii Fresh" } });
    fireEvent.change(within(dialog).getByLabelText("Contact Email"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        ...savedProfile,
        displayName: "Malii Fresh",
        email: "",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // The label is an override, and an ordinary metadata save must not create one.
  it("leaves an untouched display name and logo out of the write", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Voucher Description"), {
      target: { value: "Fresh produce, household goods and airtime." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    const written = mocks.updateProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written.description).toBe("Fresh produce, household goods and airtime.");
    expect("displayName" in written).toBe(false);
    expect("iconUrl" in written).toBe(false);
  });

  it("clears an override when the owner restores the immutable contract name", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    mocks.detailResult.data = detail({
      name: "Malii Fresh",
      contractName: "Priscilah Malii",
    });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Display name"), {
      target: { value: "Priscilah Malii" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile.mock.calls[0]?.[0]).toMatchObject({ displayName: "" });
  });

  it("does not write a blank display name", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Display name"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe("Display name is required");
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});

describe("VoucherDetailPage contract controls", () => {
  const OWNER = "0xDeF0000000000000000000000000000000000456";

  it("shows signed contract controls only to the connected voucher owner", () => {
    const visitor = render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.queryByLabelText("Voucher controls")).toBeNull();
    visitor.unmount();

    mocks.address = OWNER.toUpperCase();
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    const controls = screen.getByLabelText("Voucher controls");
    expect(within(controls).getByRole("button", { name: "Create vouchers" })).toBeTruthy();
    expect(within(controls).getByRole("button", { name: "Transfer ownership" })).toBeTruthy();
  });

  it("converts the entered amount and relays a mint through the active owner", async () => {
    mocks.address = OWNER;
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    fireEvent.click(screen.getByRole("button", { name: "Create vouchers" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Create vouchers"), {
      target: { value: "12.34" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create vouchers" }));

    await waitFor(() =>
      expect(mocks.createVouchers).toHaveBeenCalledWith({
        tokenAddress: ADDRESS,
        ownerAddress: OWNER,
        amountRaw: "1234",
        includeAuthorization: false,
      }),
    );
  });

  it("relays ownership transfer with the authorization when delegation is needed", async () => {
    mocks.address = OWNER;
    mocks.delegationStatus = "not-delegated";
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("New owner address"), {
      target: { value: OTHER },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Transfer ownership" }));

    await waitFor(() =>
      expect(mocks.transferOwnership).toHaveBeenCalledWith({
        tokenAddress: ADDRESS,
        ownerAddress: OWNER,
        newOwnerAddress: OTHER,
        includeAuthorization: true,
      }),
    );
  });
});

describe("VoucherDetailPage retire", () => {
  const OWNER = "0xDeF0000000000000000000000000000000000456";

  beforeEach(() => {
    mocks.retireVoucher.mockReset();
    mocks.retireVoucher.mockResolvedValue(undefined);
    mocks.navigate.mockReset();
  });

  it("offers retire on the catalog rule, not the wallet one", () => {
    // A stranger sees nothing, whatever wallet is connected.
    mocks.auth.session = { address: OTHER, chainId: 42220 };
    mocks.address = OWNER;
    const stranger = render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.queryByRole("button", { name: "Retire voucher" })).toBeNull();
    stranger.unmount();

    // The catalog owner sees it even with no wallet connected: retiring writes
    // the record, not the token, so it needs no signature.
    mocks.auth.session = { address: OWNER.toUpperCase(), chainId: 42220 };
    mocks.address = undefined;
    const owner = render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByRole("button", { name: "Retire voucher" })).toBeTruthy();
    // And it reads below Transfer ownership rather than above it.
    owner.unmount();

    mocks.address = OWNER;
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    const controls = screen.getByLabelText("Voucher controls");
    const labels = within(controls)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels.indexOf("Retire voucher")).toBeGreaterThan(labels.indexOf("Transfer ownership"));
  });

  it("lets a superadmin retire a voucher they do not own", () => {
    mocks.auth.session = { address: OTHER, chainId: 42220, role: "SUPERADMIN" };
    mocks.address = undefined;
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);
    expect(screen.getByRole("button", { name: "Retire voucher" })).toBeTruthy();
  });

  it("confirms before retiring, then leaves for the screen Back points at", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" origin="wallet" />);

    fireEvent.click(screen.getByRole("button", { name: "Retire voucher" }));
    const dialog = await screen.findByRole("dialog");
    // Opening the sheet must not have written anything yet.
    expect(mocks.retireVoucher).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retire voucher" }));

    await waitFor(() => expect(mocks.retireVoucher).toHaveBeenCalledTimes(1));
    // `replace`, so Back cannot return to a page that no longer resolves.
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/",
        search: { tab: "wallet" },
        replace: true,
      }),
    );
  });

  it("stays put when the confirmation is cancelled", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    fireEvent.click(screen.getByRole("button", { name: "Retire voucher" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mocks.retireVoucher).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps the viewer on the page when the write fails", async () => {
    mocks.auth.session = { address: OWNER, chainId: 42220 };
    mocks.retireVoucher.mockRejectedValue(new Error("Voucher is already retired"));
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    fireEvent.click(screen.getByRole("button", { name: "Retire voucher" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retire voucher" }));

    await waitFor(() => expect(mocks.retireVoucher).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
