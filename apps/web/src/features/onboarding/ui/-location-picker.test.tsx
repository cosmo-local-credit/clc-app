import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type MockGeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

const {
  mockSearchLocations,
  mockReverseLocation,
  mockRequestGeolocation,
  mockGeoState,
  mockMapVisible,
} = vi.hoisted(() => ({
  mockSearchLocations: vi.fn(),
  mockReverseLocation: vi.fn(),
  mockRequestGeolocation: vi.fn(),
  mockGeoState: { current: { status: "idle" } as MockGeoState },
  mockMapVisible: { current: true },
}));

vi.mock("#/features/onboarding/api/geo-client", () => ({
  searchLocations: mockSearchLocations,
  reverseLocation: mockReverseLocation,
}));

vi.mock("./use-browser-geolocation", () => ({
  useBrowserGeolocation: () => ({
    state: mockGeoState.current,
    request: mockRequestGeolocation,
  }),
}));

vi.mock("./location-map.lazy", () => ({
  LocationMap: ({
    lat,
    lng,
    onLocationChange,
  }: {
    lat?: number | null;
    lng?: number | null;
    onLocationChange?: (lat: number, lng: number) => void;
  }) =>
    mockMapVisible.current ? (
      <div>
        <span data-testid="map-pin">
          {lat},{lng}
        </span>
        <button type="button" onClick={() => onLocationChange?.(-1.29, 36.82)}>
          pick map location
        </button>
      </div>
    ) : null,
}));

import { LocationPicker } from "./location-picker";

beforeEach(() => {
  vi.useRealTimers();
  mockSearchLocations.mockReset();
  mockReverseLocation.mockReset();
  mockReverseLocation.mockResolvedValue(null);
  mockRequestGeolocation.mockReset();
  mockGeoState.current = { status: "idle" };
  mockMapVisible.current = true;
});

describe("LocationPicker", () => {
  it("does not render the browser-only map during server rendering", () => {
    const html = renderToString(<LocationPicker onChange={vi.fn()} value={undefined} />);

    expect(html).toContain("Loading location map");
    expect(html).not.toContain("pick map location");
  });

  it("shows the top four search suggestions without selecting for the user", async () => {
    vi.useFakeTimers();
    mockSearchLocations.mockResolvedValue([
      {
        address: "Nairobi CBD, Kenya",
        lat: -1.2921,
        lng: 36.8219,
        score: 99,
      },
      {
        address: "Nairobi West, Kenya",
        lat: -1.31,
        lng: 36.81,
        score: 95,
      },
      {
        address: "Nairobi Central, Kenya",
        lat: -1.2864,
        lng: 36.8172,
        score: 92,
      },
      {
        address: "Nairobi South, Kenya",
        lat: -1.32,
        lng: 36.84,
        score: 89,
      },
      {
        address: "Nairobi North, Kenya",
        lat: -1.25,
        lng: 36.82,
        score: 80,
      },
    ]);
    const onChange = vi.fn();
    render(<LocationPicker onChange={onChange} value={undefined} />);

    fireEvent.change(screen.getByRole("searchbox", { name: /location/i }), {
      target: { value: "Nai" },
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /nairobi cbd/i })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /nairobi north/i })).toBeNull();
    expect(mockReverseLocation).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pins and reverse-geocodes the suggestion selected by the user", async () => {
    vi.useFakeTimers();
    mockSearchLocations.mockResolvedValue([
      {
        address: "Nairobi, Kenya",
        lat: -1.2921,
        lng: 36.8219,
        score: 99,
      },
    ]);
    mockReverseLocation.mockResolvedValue({
      locationName: "Nairobi, Kenya",
      country: "KE",
    });
    render(<LocationPicker onChange={vi.fn()} value={undefined} />);

    fireEvent.change(screen.getByRole("searchbox", { name: /location/i }), {
      target: { value: "Nairobi" },
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /nairobi/i }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("map-pin").textContent).toBe("-1.2921,36.8219");
    expect(mockReverseLocation).toHaveBeenCalledWith(-1.2921, 36.8219, expect.any(AbortSignal));
  });

  it("does not show stale suggestions when an older search resolves after the query changes", async () => {
    vi.useFakeTimers();
    let resolveFirstSearch: (value: unknown) => void = () => undefined;
    mockSearchLocations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSearch = resolve;
        }),
    );
    mockSearchLocations.mockResolvedValueOnce([
      {
        address: "Nairobi West, Kenya",
        lat: -1.31,
        lng: 36.81,
        score: 95,
      },
    ]);
    mockReverseLocation.mockResolvedValue({
      locationName: "Nairobi West, Kenya",
      country: "KE",
    });
    render(<LocationPicker onChange={vi.fn()} value={undefined} />);

    fireEvent.change(screen.getByRole("searchbox", { name: /location/i }), {
      target: { value: "Nai" },
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    fireEvent.change(screen.getByRole("searchbox", { name: /location/i }), {
      target: { value: "Nairo" },
    });
    await act(async () => {
      resolveFirstSearch([
        {
          address: "Nakuru, Kenya",
          lat: -0.3031,
          lng: 36.08,
          score: 80,
        },
      ]);
      await Promise.resolve();
    });

    expect(screen.queryByRole("option", { name: /nakuru/i })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.getByRole("option", { name: /nairobi west/i })).toBeTruthy();
    expect(screen.getByTestId("map-pin").textContent).toBe(",");
  });

  it("clears the map pin when the parent clears the location value", () => {
    const { rerender } = render(
      <LocationPicker
        onChange={vi.fn()}
        value={{
          lat: -1.2921,
          lng: 36.8219,
          locationName: "Nairobi, Kenya",
          country: "KE",
        }}
      />,
    );

    expect(screen.getByTestId("map-pin").textContent).toBe("-1.2921,36.8219");

    rerender(<LocationPicker onChange={vi.fn()} value={undefined} />);

    expect(screen.getByTestId("map-pin").textContent).toBe(",");
  });

  it("reverse-geocodes map taps and fills the location input", async () => {
    mockReverseLocation.mockResolvedValue({
      locationName: "Mathira, Nyeri, Kenya",
      country: "KE",
    });
    const onChange = vi.fn();
    render(<LocationPicker onChange={onChange} value={undefined} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pick map location/i }));
      await Promise.resolve();
    });

    expect(screen.getByRole("searchbox", { name: /location/i })).toHaveProperty(
      "value",
      "Mathira, Nyeri, Kenya",
    );
    expect(screen.queryByText("Mathira, Nyeri, Kenya")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({
      lat: -1.29,
      lng: 36.82,
      locationName: "Mathira, Nyeri, Kenya",
      country: "KE",
    });
  });

  it("hides the required-location error while reverse geocoding a new pin", async () => {
    let resolveReverse: (value: { locationName: string; country: string }) => void = () =>
      undefined;
    mockReverseLocation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReverse = resolve;
        }),
    );
    render(<LocationPicker onChange={vi.fn()} value={undefined} error="Choose a location" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pick map location/i }));
      await Promise.resolve();
    });

    expect(screen.getByText(/identifying location/i)).toBeTruthy();
    expect(screen.queryByText(/choose a location/i)).toBeNull();

    await act(async () => {
      resolveReverse({ locationName: "Mathira, Nyeri, Kenya", country: "KE" });
      await Promise.resolve();
    });
  });

  it("reverse-geocodes map taps and blocks value when no country is identified", async () => {
    mockReverseLocation.mockResolvedValue(null);
    const onChange = vi.fn();
    render(<LocationPicker onChange={onChange} value={undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /pick map location/i }));

    await screen.findByText(/couldn't identify a country/i);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("requests geolocation only when the trailing icon button is tapped", () => {
    render(<LocationPicker onChange={vi.fn()} value={undefined} />);
    expect(mockRequestGeolocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(mockRequestGeolocation).toHaveBeenCalledTimes(1);
  });

  it("disables the geolocation icon when location is unavailable", () => {
    mockGeoState.current = { status: "denied" };
    render(<LocationPicker onChange={vi.fn()} value={undefined} />);

    expect(screen.getByRole("button", { name: /location unavailable/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("falls back to search-only UI when the map is unavailable", () => {
    mockMapVisible.current = false;
    render(<LocationPicker onChange={vi.fn()} value={undefined} />);

    expect(screen.getByRole("searchbox", { name: /location/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /pick map location/i })).toBeNull();
  });

  it("auto-pins and reverse-geocodes when geolocation transitions to granted", async () => {
    mockReverseLocation.mockResolvedValue({
      locationName: "Nairobi, Kenya",
      country: "KE",
    });
    const onChange = vi.fn();

    mockGeoState.current = { status: "idle" };
    const { rerender } = render(<LocationPicker onChange={onChange} value={undefined} />);

    mockGeoState.current = {
      status: "granted",
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 10,
    };

    await act(async () => {
      rerender(<LocationPicker onChange={onChange} value={undefined} />);
      await Promise.resolve();
    });

    expect(mockReverseLocation).toHaveBeenCalledWith(-1.2921, 36.8219, expect.any(AbortSignal));
    expect(onChange).toHaveBeenLastCalledWith({
      lat: -1.2921,
      lng: 36.8219,
      locationName: "Nairobi, Kenya",
      country: "KE",
    });
  });

  it("does not re-run granted geolocation when the parent rerenders", async () => {
    mockGeoState.current = {
      status: "granted",
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 10,
    };
    mockReverseLocation.mockResolvedValue({
      locationName: "Nairobi, Kenya",
      country: "KE",
    });
    const firstOnChange = vi.fn();
    const { rerender } = render(<LocationPicker onChange={firstOnChange} value={undefined} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockReverseLocation).toHaveBeenCalledTimes(1);

    rerender(<LocationPicker onChange={vi.fn()} value={undefined} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockReverseLocation).toHaveBeenCalledTimes(1);
  });

  it("shows the reverse error and calls onChange(undefined) when locationSchema parse fails", async () => {
    mockReverseLocation.mockResolvedValue({
      locationName: "x".repeat(201),
      country: "KE",
    });
    const onChange = vi.fn();
    render(<LocationPicker onChange={onChange} value={undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /pick map location/i }));

    await screen.findByText(/couldn't identify a country/i);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("shows a geolocation error message when the geo status is error", () => {
    mockGeoState.current = {
      status: "error",
      message: "Position acquisition timed out",
    };
    render(<LocationPicker onChange={vi.fn()} value={undefined} />);

    expect(screen.getByText(/position acquisition timed out/i)).toBeTruthy();
  });

  it("calls onChange with the full LocationInput after suggestion selection and reverse geocode", async () => {
    vi.useFakeTimers();
    mockSearchLocations.mockResolvedValue([
      {
        address: "Nairobi, Kenya",
        lat: -1.2921,
        lng: 36.8219,
        score: 99,
      },
    ]);
    mockReverseLocation.mockResolvedValue({
      locationName: "Nairobi, Kenya",
      country: "KE",
    });
    const onChange = vi.fn();
    render(<LocationPicker onChange={onChange} value={undefined} />);

    fireEvent.change(screen.getByRole("searchbox", { name: /location/i }), {
      target: { value: "Nairobi" },
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /nairobi/i }));
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenLastCalledWith({
      lat: -1.2921,
      lng: 36.8219,
      locationName: "Nairobi, Kenya",
      country: "KE",
    });
  });

  it("initialises the map pin from a pre-populated value prop", () => {
    render(
      <LocationPicker
        onChange={vi.fn()}
        value={{
          lat: -1.2921,
          lng: 36.8219,
          locationName: "Nairobi, Kenya",
          country: "KE",
        }}
      />,
    );

    expect(screen.getByTestId("map-pin").textContent).toBe("-1.2921,36.8219");
  });
});
