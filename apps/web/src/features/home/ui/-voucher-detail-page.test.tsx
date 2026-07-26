import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucherDetail } from "#/features/home/api/market-client";

const detailResult = vi.hoisted(() => ({
  current: {
    data: undefined as MarketVoucherDetail | undefined,
    isPending: false,
    isError: false,
    refetch: () => {},
  },
}));

const lastLocationMapProps = vi.hoisted(() => ({
  current: null as { lat?: number | null; lng?: number | null } | null,
}));

vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => detailResult.current,
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: (props: { lat?: number | null; lng?: number | null }) => {
    lastLocationMapProps.current = props;
    return <div data-testid="location-map" />;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children?: unknown; to?: string }) => (
    <a href={to} {...rest}>
      {children as never}
    </a>
  ),
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: () => {} } }),
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
    decimals: 6,
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
  lastLocationMapProps.current = null;
  detailResult.current = {
    data: detail(),
    isPending: false,
    isError: false,
    refetch: () => {},
  };
});

describe("VoucherDetailPage", () => {
  it("titles the page with the voucher name and shows its symbol", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Priscilah Malii");
    expect(screen.getByText("MALII")).toBeTruthy();
  });

  it("states the unit of account as one rate sentence", () => {
    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    expect(screen.getByText("1 MALII = 10 KSH")).toBeTruthy();
  });

  it("omits the rate when the issuer set no unit of account", () => {
    detailResult.current.data = detail({ voucherUoa: null, voucherValue: null });
    render(<VoucherDetailPage voucherAddress={ADDRESS} />);

    expect(screen.queryByText(/^1 MALII =/)).toBeNull();
  });

  describe("banner", () => {
    it("renders the catalog banner", () => {
      const { container } = render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      const banner = container.querySelector('img[src="https://content.example/banner.jpg"]');
      expect(banner).not.toBeNull();
      // The banner is the page's hero, so it must not wait for lazy loading.
      expect(banner?.getAttribute("loading")).toBe("eager");
    });

    // About two thirds of the catalog has no banner. The fallback must be a
    // deliberate surface, never an <img> with no source.
    it("renders no image element when there is no banner", () => {
      detailResult.current.data = detail({ bannerUrl: null, iconUrl: null });
      const { container } = render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(container.querySelectorAll("img")).toHaveLength(0);
    });
  });

  describe("contact details", () => {
    it("makes the email actionable", () => {
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      const email = screen.getByText("issuer@example.org");
      expect(email.getAttribute("href")).toBe("mailto:issuer@example.org");
    });

    it("makes the phone dialable", () => {
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.getByText("+254700000000").getAttribute("href")).toBe("tel:+254700000000");
    });

    // The website is an imported third-party URL, so the new tab must not get
    // window.opener or a referrer pointing back at the wallet.
    it("opens the website without handing over the opener or referrer", () => {
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      const link = screen.getByText("https://example.org");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    });

    it("hides the whole panel when the catalog has no contact details", () => {
      detailResult.current.data = detail({
        email: null,
        website: null,
        phone: null,
        ownerAddress: null,
      });
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.queryByText("Email")).toBeNull();
      expect(screen.queryByText("Issuer")).toBeNull();
    });
  });

  describe("location", () => {
    it("pins the map at the voucher's coordinates", () => {
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.getByTestId("location-map")).toBeTruthy();
      expect(lastLocationMapProps.current).toMatchObject({ lat: -1.450979, lng: 38.235115 });
      expect(screen.getByText("C96, KEN")).toBeTruthy();
    });

    // A map centred on a default city would claim the voucher is somewhere it
    // is not, which is worse than showing only the place name.
    it("shows the place name instead of a map when coordinates are missing", () => {
      detailResult.current.data = detail({ lat: null, lng: null });
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.queryByTestId("location-map")).toBeNull();
      expect(screen.getByText("C96, KEN")).toBeTruthy();
    });

    it("shows no location section at all with neither coordinates nor a name", () => {
      detailResult.current.data = detail({ lat: null, lng: null, locationName: null });
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.queryByTestId("location-map")).toBeNull();
      expect(screen.queryByText("Location")).toBeNull();
    });
  });

  describe("query states", () => {
    it("shows a loading message without an empty heading", () => {
      detailResult.current = { ...detailResult.current, data: undefined, isPending: true };
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.getByText(/loading voucher/i)).toBeTruthy();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    });

    it("offers a retry when the voucher fails to load", () => {
      const refetch = vi.fn();
      detailResult.current = { data: undefined, isPending: false, isError: true, refetch };
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.getByText(/couldn't load this voucher/i)).toBeTruthy();
      screen.getByRole("button", { name: /retry/i }).click();
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    // Every state keeps a way back, including a deep-linked load with no
    // in-app history behind it.
    it.each([
      ["loaded", { data: detail(), isPending: false, isError: false }],
      ["loading", { data: undefined, isPending: true, isError: false }],
      ["failed", { data: undefined, isPending: false, isError: true }],
    ])("keeps a route back to the market while %s", (_label, state) => {
      detailResult.current = { ...detailResult.current, ...state };
      render(<VoucherDetailPage voucherAddress={ADDRESS} />);

      expect(screen.getByText("Market").closest("a")?.getAttribute("href")).toBe("/");
    });
  });
});
