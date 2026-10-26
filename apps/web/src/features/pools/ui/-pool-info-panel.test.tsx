import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { UserPool } from "@clc/api/features/pools/client";

const mocks = vi.hoisted(() => ({
  maps: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("#/components/ui/location-map.lazy", () => ({
  LocationMap: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="location-map">{`${lat},${lng}`}</div>
  ),
}));

vi.mock("#/lib/default-maps", () => ({ openDefaultMaps: mocks.maps }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { PoolInfoPanel } from "./pool-info-panel";

const pool = {
  id: "7",
  active: true,
  chainId: 100,
  address: "0xAbC0000000000000000000000000000000000123",
  name: "Kilifi Pool",
  symbol: "KLP",
  ownerAddress: "0xDeF0000000000000000000000000000000000456",
  feePpm: 0,
  feeAddress: null,
  tokenRegistryAddress: null,
  limiterAddress: null,
  quoterAddress: null,
  quoterType: null,
  feePolicyAddress: null,
  protocolFeeControllerAddress: null,
  feesDecoupled: false,
  decimals: 18,
  description: "Local traders",
  unitOfAccount: "KES",
  email: "steward@example.org",
  website: "https://example.org",
  phone: "+254700000000",
  terms: "Shared rules",
  locationName: "Kilifi",
  geoLat: -3.63,
  geoLng: 39.85,
  imageUrl: null,
  bannerUrl: null,
  defaultVoucherId: null,
  voucherCount: 0,
  tags: [],
} satisfies UserPool;

beforeEach(() => {
  mocks.maps.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe("PoolInfoPanel", () => {
  it("opens the exact pool location and reports an unavailable clipboard", () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<PoolInfoPanel pool={pool} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy contract address" }));
    expect(mocks.error).toHaveBeenCalledWith("Couldn't copy contract address");

    fireEvent.click(screen.getByRole("button", { name: "Open in Maps" }));
    expect(mocks.maps).toHaveBeenCalledWith({ label: "Kilifi", lat: -3.63, lng: 39.85 });
  });

  it("reports successful and failed clipboard writes", async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<PoolInfoPanel pool={pool} />);

    const copy = screen.getByRole("button", { name: "Copy contract address" });
    fireEvent.click(copy);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Contract address copied"));

    fireEvent.click(copy);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Couldn't copy contract address"));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("renders the coordinate fallback and linked terms without optional contacts", () => {
    render(
      <PoolInfoPanel
        pool={{
          ...pool,
          description: "",
          unitOfAccount: null,
          email: null,
          website: null,
          phone: null,
          terms: "https://example.org/terms",
          locationName: null,
        }}
      />,
    );

    expect(screen.getByText("-3.63, 39.85")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "https://example.org/terms" }).getAttribute("href"),
    ).toBe("https://example.org/terms");
    expect(screen.queryByRole("link", { name: "steward@example.org" })).toBeNull();
    expect(screen.getByTestId("location-map").textContent).toBe("-3.63,39.85");
  });

  it("omits location and terms when neither a label nor coordinates are available", () => {
    render(
      <PoolInfoPanel
        pool={{
          ...pool,
          description: "",
          terms: null,
          locationName: null,
          geoLat: null,
          geoLng: null,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Open in Maps" })).toBeNull();
    expect(screen.queryByText("Terms")).toBeNull();
    expect(screen.queryByTestId("location-map")).toBeNull();
  });
});
