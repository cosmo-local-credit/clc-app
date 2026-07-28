import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher } from "#/features/home/api/market-client";

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
}));

vi.mock("#/features/home/hooks/use-market-camera", () => ({
  useMarketCamera: () => mocks.camera,
}));

vi.mock("#/features/home/hooks/use-market-vouchers", () => ({
  useMarketMapVouchers: () => mocks.catalog,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
    children: ReactNode;
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
    ...overrides,
  };
}

beforeEach(() => {
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
  it("renders the first catalog page immediately when no location fix exists", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: [voucher(1, -1.29, 36.82)],
      isCatalogComplete: false,
    };

    render(<MarketListPage />);

    expect(screen.queryByText("Loading marketplace…")).toBeNull();
    expect(screen.getByLabelText("Marketplace vouchers")).toBeTruthy();
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
    expect(screen.queryByLabelText("Marketplace vouchers")).toBeNull();
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

    const list = screen.getByLabelText("Marketplace vouchers");
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      expect.stringContaining("Near voucher"),
      expect.stringContaining("Middle voucher"),
      expect.stringContaining("Far voucher"),
    ]);
    expect(screen.getByText("Vouchers ordered by approximate distance.")).toBeTruthy();
  });

  it("reveals the complete sorted catalog in infinite-scroll batches", () => {
    mocks.catalog = {
      ...mocks.catalog,
      vouchers: Array.from({ length: 25 }, (_, index) =>
        voucher(25 - index, -1.29 - index * 0.001, 36.82),
      ),
    };

    render(<MarketListPage />);

    const list = screen.getByLabelText("Marketplace vouchers");
    expect(within(list).getAllByRole("link")).toHaveLength(20);

    act(() => {
      mocks.intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(within(list).getAllByRole("link")).toHaveLength(25);
  });

  it("offers real location sorting and links to the map subview", () => {
    render(<MarketListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use current location" }));
    expect(mocks.camera.requestLocation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("href")).toBe(
      "/?tab=market&view=map",
    );
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
});
