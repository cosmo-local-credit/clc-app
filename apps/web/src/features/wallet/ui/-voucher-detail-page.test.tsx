import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucherDetail } from "#/features/home/api/market-client";
import type { ReportSummary } from "#/features/home/api/reports-client";

const mocks = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as string | undefined,
  auth: { isAuthenticated: true, isLoading: false },
  detailResult: {
    data: undefined as MarketVoucherDetail | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  openDefaultMaps: vi.fn(),
  offeringAddress: undefined as string | undefined,
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
              commodityName: string;
              commodityType: string;
              description: string;
              quantity: string;
              unit: string | null;
              frequency: "day" | "week" | "month" | "year" | null;
              price: string | null;
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
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: mocks.address }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
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
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: mocks.openDefaultMaps,
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => mocks.detailResult,
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAccountTokensInfinite: () => ({
    data: {
      pages: [
        {
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
        },
      ],
    },
    isPending: false,
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

vi.mock("#/features/pools/hooks/use-pool-vouchers", () => ({
  usePoolVouchersInfinite: () => ({ data: undefined, isPending: false }),
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: (address: string | undefined) => {
    mocks.offeringAddress = address;
    return mocks.offeringsResult;
  },
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
    iconUrl: "https://content.example/icon.jpg",
    bannerUrl: "https://content.example/banner.jpg",
    kind: "goods",
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
    authorAddress: null,
    createdAt: null,
    updatedAt: "2026-07-19T08:14:02.311Z",
    tags: ["Food production"],
    vouchers: [{ address: ADDRESS, name: "Priscilah Malii", symbol: "MALII" }],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.address = "0x1111111111111111111111111111111111111111";
  mocks.auth = { isAuthenticated: true, isLoading: false };
  mocks.openDefaultMaps.mockReset();
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
              commodityName: "Vegetables",
              commodityType: "GOOD",
              description: "Fresh produce",
              quantity: "5",
              unit: "kg",
              frequency: "week",
              price: "10",
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
              commodityName: "Farm training",
              commodityType: "SERVICE",
              description: "",
              quantity: "1000000000",
              unit: null,
              frequency: null,
              price: null,
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
  it("puts balance and the three voucher actions above the tabs", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByRole("heading", { name: "Priscilah Malii" })).toBeTruthy();
    expect(screen.getByLabelText("Balance").textContent).toContain("12.34 MALII");
    expect(screen.queryByText("KSH")).toBeNull();

    const actions = screen.getByLabelText("Voucher actions");
    expect(actions.textContent).toBe("RedeemSendReceive");
    // Redeem is a send to the issuer, with the voucher already selected.
    const redeem = within(actions).getByRole("link", { name: "Redeem" });
    expect(redeem.getAttribute("data-variant")).toBe("default");
    expect(redeem.getAttribute("href")).toBe(
      `/wallet/send/amount?token=${ADDRESS}&recipient=0xDeF0000000000000000000000000000000000456`,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Offerings",
      "Info",
      "Activity",
      "Reviews",
      "Posts",
    ]);
    expect(screen.getByRole("tab", { name: "Offerings" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    const offerings = screen.getByRole("tabpanel");
    expect(within(offerings).getByText("Vegetables")).toBeTruthy();
    expect(within(offerings).getByText("10 MALII")).toBeTruthy();
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
    // Redundant with the voucher itself, and replaced by the quantity stepper.
    expect(within(dialog).queryByText("Kangemi Market")).toBeNull();
    expect(within(dialog).queryByText("Seller")).toBeNull();
    // Tapping outside dismisses, so the only close control is screen-reader only.
    expect(within(dialog).getByText("Close").className).toContain("sr-only");
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

  it("gives the quantity and total rows one shared height", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Vegetables" }));

    const dialog = screen.getByRole("dialog");
    const quantityRow = within(dialog).getByText("Quantity").parentElement;
    const totalRow = within(dialog).getByText("Total").parentElement;

    expect(quantityRow?.className).toContain("h-14");
    expect(totalRow?.className).toContain("h-14");
  });

  it("multiplies the unit price into a running total as the quantity changes", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Vegetables" }));

    const dialog = screen.getByRole("dialog");
    const totalRow = () => within(dialog).getByText("Total").parentElement?.textContent;
    const decrease = within(dialog).getByRole("button", {
      name: "Decrease quantity",
    }) as HTMLButtonElement;

    expect(within(dialog).getByText("10 MALII each")).toBeTruthy();
    expect(totalRow()).toContain("10 MALII");
    // One is the floor, so the minus is inert until the quantity leaves it.
    expect(decrease.disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Increase quantity" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Increase quantity" }));

    expect(totalRow()).toContain("30 MALII");
    expect(decrease.disabled).toBe(false);

    fireEvent.click(decrease);

    expect(totalRow()).toContain("20 MALII");
    expect(within(dialog).getByRole("button", { name: /Add to cart/ })).toBeTruthy();
  });

  it("shows no total for an offering the issuer never priced", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    fireEvent.click(screen.getByRole("button", { name: "View offering details: Farm training" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Price on request")).toBeTruthy();
    expect(within(dialog).queryByText("Total")).toBeNull();
    // The quantity is still selectable: an unpriced item is still orderable.
    expect(within(dialog).getByRole("button", { name: "Increase quantity" })).toBeTruthy();
  });

  it("disables Redeem when the voucher has no known issuer to send back to", () => {
    mocks.detailResult.data = detail({ ownerAddress: null });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    const actions = screen.getByLabelText("Voucher actions");
    expect(within(actions).queryByRole("link", { name: "Redeem" })).toBeNull();
    expect(
      (within(actions).getByRole("button", { name: "Redeem" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("skips the offerings request when the voucher kind proves the tab is empty", () => {
    mocks.detailResult.data = detail({ kind: "voucher" });

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />);

    expect(screen.getByText("No offerings yet")).toBeTruthy();
    expect(mocks.offeringAddress).toBeUndefined();
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
    render(
      <VoucherDetailPage
        voucherAddress="0x9990000000000000000000000000000000000999"
        activeTab="offerings"
      />,
    );

    expect(screen.getByLabelText("Balance").textContent).toContain("0 MALII");
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

    const panel = screen.getByRole("tabpanel");
    const rate = within(panel).getByText("1 MALII = 10 KSH");
    expect(rate.className).toContain("text-sm");
    expect(rate.className).toContain("text-primary");
    expect(screen.queryByText("Description")).toBeNull();
    const description = screen.getByText("Fresh produce and household goods.");
    expect(description.parentElement).toBe(rate.parentElement);
    expect(description.parentElement?.className).toContain("bg-card");

    const labels = Array.from(panel.querySelectorAll("dt"), (node) => node.textContent);
    expect(labels).toEqual(["Contract address", "Email", "Website", "Phone", "Issuer"]);
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

    const location = screen.getByText("C96, KEN");
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

  it("omits absent email and phone rows", () => {
    mocks.detailResult.data = detail({ email: null, phone: null });
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="info" />);

    expect(screen.queryByText("Email")).toBeNull();
    expect(screen.queryByText("Phone")).toBeNull();
    expect(screen.getByText("Website")).toBeTruthy();
  });

  it("uses a deliberate fallback instead of broken image elements", () => {
    mocks.detailResult.data = detail({ bannerUrl: null, iconUrl: null });
    const { container } = render(
      <VoucherDetailPage voucherAddress={ADDRESS} activeTab="offerings" />,
    );

    expect(container.querySelector('img[src="https://content.example/icon.jpg"]')).toBeNull();
    expect(container.textContent).toContain("MA");
  });

  it("preserves the reviews panel alongside the posts tab", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="reviews" />);

    expect(screen.getByText("Reviews for this voucher will appear here.")).toBeTruthy();
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      "voucher-tab-reviews",
    );
  });

  it("renders only this voucher's posts in the posts tab", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(mocks.reportVoucher).toEqual({ chainId: 42220, address: ADDRESS });
    expect(mocks.reportsEnabled).toBe(true);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe("voucher-tab-posts");
    expect(within(panel).getByText("Harvesting greengrams with Wendo group")).toBeTruthy();
    expect(within(panel).getByRole("link").getAttribute("href")).toBe("/posts/3182");
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

  it("loads the next related-post page when the sentinel enters view", () => {
    let intersect: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          intersect = callback;
        }

        observe = observe;
        disconnect = disconnect;
      },
    );
    mocks.reportsResult.hasNextPage = true;

    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="posts" />);

    expect(observe).toHaveBeenCalledOnce();
    act(() => intersect?.([{ isIntersecting: true }]));
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
    mocks.auth = { isAuthenticated: false, isLoading: false };

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
