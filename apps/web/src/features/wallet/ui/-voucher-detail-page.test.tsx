import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucherDetail } from "#/features/home/api/market-client";

const mocks = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as string | undefined,
  detailResult: {
    data: undefined as MarketVoucherDetail | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  openDefaultMaps: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: mocks.address }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
    params?: { voucherAddress?: string };
    search?: Record<string, string | undefined>;
    to: string;
    replace?: boolean;
    resetScroll?: boolean;
  }) => {
    const path = params?.voucherAddress ? to.replace("$voucherAddress", params.voucherAddress) : to;
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

beforeEach(() => {
  mocks.address = "0x1111111111111111111111111111111111111111";
  mocks.openDefaultMaps.mockReset();
  mocks.detailResult = {
    data: detail(),
    isPending: false,
    isError: false,
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
    ]);
    expect(screen.getByRole("tab", { name: "Offerings" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Offerings for this voucher will appear here.")).toBeTruthy();
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
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);

    fireEvent.load(avatar);

    expect(avatar.dataset.state).toBe("loaded");
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
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

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).toContain("MA");
  });

  it("renders the reviews placeholder as the last tab panel", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} activeTab="reviews" />);

    expect(screen.getByText("Reviews for this voucher will appear here.")).toBeTruthy();
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      "voucher-tab-reviews",
    );
  });
});
