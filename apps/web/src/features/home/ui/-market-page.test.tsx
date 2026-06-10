import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

type GeoReturn = { state: GeoState; request: () => void };

const mockRequest = vi.fn();
const mockUseBrowserGeolocation = vi.fn<() => GeoReturn>(() => ({
  state: { status: "idle" },
  request: mockRequest,
}));

vi.mock("#/lib/use-browser-geolocation", () => ({
  useBrowserGeolocation: () => mockUseBrowserGeolocation(),
}));

vi.mock("./market-map.lazy", () => ({
  MarketMap: () => <div data-testid="market-map" />,
}));

import { MarketPage } from "./market-page";

beforeEach(() => {
  mockRequest.mockClear();
  mockUseBrowserGeolocation.mockReturnValue({
    state: { status: "idle" },
    request: mockRequest,
  });
});

describe("MarketPage", () => {
  it("shows 'Use current location' button in idle state", () => {
    render(<MarketPage />);
    expect(screen.getByRole("button", { name: "Use current location" })).toBeTruthy();
  });

  it("shows 'Finding location' label when geolocation is requesting", () => {
    mockUseBrowserGeolocation.mockReturnValue({
      state: { status: "requesting" },
      request: mockRequest,
    });
    render(<MarketPage />);
    expect(screen.getByRole("button", { name: "Finding location" })).toBeTruthy();
  });

  it("shows 'Location denied' label when geolocation is denied", () => {
    mockUseBrowserGeolocation.mockReturnValue({
      state: { status: "denied" },
      request: mockRequest,
    });
    render(<MarketPage />);
    expect(screen.getByRole("button", { name: "Location denied" })).toBeTruthy();
  });

  it("shows 'Location unavailable' label when geolocation is unavailable", () => {
    mockUseBrowserGeolocation.mockReturnValue({
      state: { status: "unavailable" },
      request: mockRequest,
    });
    render(<MarketPage />);
    expect(screen.getByRole("button", { name: "Location unavailable" })).toBeTruthy();
  });

  it("enables the location button in idle state", () => {
    render(<MarketPage />);
    const button = screen.getByRole("button", {
      name: "Use current location",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("disables the location button when requesting", () => {
    mockUseBrowserGeolocation.mockReturnValue({
      state: { status: "requesting" },
      request: mockRequest,
    });
    render(<MarketPage />);
    const button = screen.getByRole("button", {
      name: "Finding location",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("disables the location button when denied", () => {
    mockUseBrowserGeolocation.mockReturnValue({
      state: { status: "denied" },
      request: mockRequest,
    });
    render(<MarketPage />);
    const button = screen.getByRole("button", {
      name: "Location denied",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("calls geolocation.request when the location button is clicked", () => {
    render(<MarketPage />);
    fireEvent.click(screen.getByRole("button", { name: "Use current location" }));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("shows the first market location preview by default", () => {
    render(<MarketPage />);
    expect(screen.getByText(/Cosmo Bakery/)).toBeTruthy();
  });

  it("shows a 'Browse all' button", () => {
    render(<MarketPage />);
    expect(screen.getByRole("button", { name: /browse all/i })).toBeTruthy();
  });
});
