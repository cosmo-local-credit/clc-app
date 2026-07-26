import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CAMERA_RANK, useMarketCamera } from "./use-market-camera";

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" };

const { geoState, mockRequest, readPersistedLocation, writePersistedLocation, ipCameraResult } =
  vi.hoisted(() => ({
    geoState: { current: { status: "idle" } as GeoState },
    mockRequest: vi.fn(),
    readPersistedLocation: vi.fn(),
    writePersistedLocation: vi.fn(),
    ipCameraResult: { current: { data: undefined as unknown } },
  }));

vi.mock("#/lib/use-browser-geolocation", () => ({
  useBrowserGeolocation: () => ({ state: geoState.current, request: mockRequest }),
}));

vi.mock("#/features/home/api/last-location-storage", () => ({
  GUEST_LOCATION_OWNER: "guest",
  readPersistedLocation,
  writePersistedLocation,
  clearPersistedLocation: vi.fn(),
}));

vi.mock("./use-ip-camera", () => ({
  useIPCamera: () => ipCameraResult.current,
  ipCameraQueryKeys: { all: ["ip-camera"], current: () => ["ip-camera", "current"] },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PERSISTED = {
  lat: -1.2,
  lng: 36.7,
  accuracy: 20,
  capturedAt: "2019-01-01T00:00:00.000Z",
};

beforeEach(() => {
  geoState.current = { status: "idle" };
  ipCameraResult.current = { data: undefined };
  mockRequest.mockReset();
  readPersistedLocation.mockReset();
  readPersistedLocation.mockReturnValue(null);
  writePersistedLocation.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMarketCamera ranking", () => {
  it("has no camera before any source resolves", () => {
    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });
    expect(result.current.camera).toBeNull();
  });

  it("uses a live GPS fix at rank 1 and zoom 14", () => {
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    expect(result.current.camera).toEqual({
      lat: -1.29,
      lng: 36.82,
      zoom: 14,
      rank: CAMERA_RANK.liveGps,
    });
  });

  it("reads persisted location only after the client boundary", async () => {
    readPersistedLocation.mockReturnValue(PERSISTED);

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    await waitFor(() =>
      expect(result.current.camera).toEqual({
        lat: PERSISTED.lat,
        lng: PERSISTED.lng,
        zoom: 14,
        rank: CAMERA_RANK.persistedGps,
      }),
    );
  });

  it("trusts storage to decide what is still usable", async () => {
    // Expiry and owner scoping live in the storage module; the hook applies
    // whatever survives that filter.
    readPersistedLocation.mockReturnValue(PERSISTED);

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    await waitFor(() => expect(result.current.camera?.rank).toBe(CAMERA_RANK.persistedGps));
  });

  it("prefers a live fix over a persisted one", async () => {
    readPersistedLocation.mockReturnValue(PERSISTED);
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    await waitFor(() => expect(result.current.camera?.rank).toBe(CAMERA_RANK.liveGps));
    expect(result.current.camera?.lat).toBe(-1.29);
  });

  it("uses a MapTiler city at rank 3", () => {
    ipCameraResult.current = {
      data: { lat: 12, lng: 34, zoom: 11, source: "ip-city" },
    };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    expect(result.current.camera).toEqual({
      lat: 12,
      lng: 34,
      zoom: 11,
      rank: CAMERA_RANK.ipCity,
    });
  });

  it("uses a country default at rank 4", () => {
    ipCameraResult.current = {
      data: { lat: -1.2921, lng: 36.8219, zoom: 12, source: "country-default" },
    };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    expect(result.current.camera?.rank).toBe(CAMERA_RANK.countryDefault);
  });

  it("prefers a persisted fix over an IP city", async () => {
    readPersistedLocation.mockReturnValue(PERSISTED);
    ipCameraResult.current = { data: { lat: 12, lng: 34, zoom: 11, source: "ip-city" } };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    await waitFor(() => expect(result.current.camera?.rank).toBe(CAMERA_RANK.persistedGps));
  });
});

describe("useMarketCamera persistence", () => {
  it("persists a real GPS fix", async () => {
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };

    renderHook(() => useMarketCamera("guest"), { wrapper });

    await waitFor(() => expect(writePersistedLocation).toHaveBeenCalledTimes(1));
    const written = writePersistedLocation.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written).toMatchObject({ lat: -1.29, lng: 36.82, accuracy: 8 });
    expect(typeof written.capturedAt).toBe("string");
    expect(Number.isNaN(Date.parse(String(written.capturedAt)))).toBe(false);
  });

  it("never persists an IP or country camera", async () => {
    ipCameraResult.current = { data: { lat: 12, lng: 34, zoom: 11, source: "ip-city" } };

    renderHook(() => useMarketCamera("guest"), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(writePersistedLocation).not.toHaveBeenCalled();
  });

  it("does not rewrite the same fix on every render", async () => {
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };

    const { rerender } = renderHook(() => useMarketCamera("guest"), { wrapper });
    await waitFor(() => expect(writePersistedLocation).toHaveBeenCalledTimes(1));
    rerender();
    rerender();

    expect(writePersistedLocation).toHaveBeenCalledTimes(1);
  });
});

describe("useMarketCamera explicit request", () => {
  it("marks a button-driven fix as explicit so the map latch cannot block it", async () => {
    const { result, rerender } = renderHook(() => useMarketCamera("guest"), { wrapper });

    act(() => {
      result.current.requestLocation();
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);

    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };
    rerender();

    expect(result.current.camera).toEqual({
      lat: -1.29,
      lng: 36.82,
      zoom: 14,
      rank: CAMERA_RANK.explicit,
    });
  });

  it("produces a fresh camera object for a repeat press so the map re-centres", async () => {
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };
    const { result, rerender } = renderHook(() => useMarketCamera("guest"), { wrapper });

    act(() => {
      result.current.requestLocation();
    });
    rerender();
    const first = result.current.camera;

    act(() => {
      result.current.requestLocation();
    });
    rerender();

    // Identical coordinates, but a new object so the map applies it again.
    expect(result.current.camera).not.toBe(first);
    expect(result.current.camera).toEqual(first);
  });
});

describe("useMarketCamera real fix reporting", () => {
  it("reports a live fix as real", () => {
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    expect(result.current.realFix).toEqual({ lat: -1.29, lng: 36.82 });
    expect(result.current.userLocation).toEqual({ lat: -1.29, lng: 36.82 });
  });

  it("reports a persisted fix as real but places no user marker", async () => {
    readPersistedLocation.mockReturnValue(PERSISTED);

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    await waitFor(() => expect(result.current.realFix).toEqual({ lat: -1.2, lng: 36.7 }));
    // A stale stored position must not be drawn as "you are here".
    expect(result.current.userLocation).toBeNull();
  });

  it("never reports an IP or country camera as a real fix", () => {
    ipCameraResult.current = { data: { lat: 12, lng: 34, zoom: 11, source: "ip-city" } };

    const { result } = renderHook(() => useMarketCamera("guest"), { wrapper });

    // Distance from an IP centroid would be a fabricated number.
    expect(result.current.realFix).toBeNull();
    expect(result.current.userLocation).toBeNull();
  });
});

describe("useMarketCamera location ownership", () => {
  it("reads and writes under the owner it is given", async () => {
    geoState.current = { status: "granted", lat: -1.29, lng: 36.82, accuracy: 8 };

    renderHook(() => useMarketCamera("0xabc"), { wrapper });

    await waitFor(() => expect(writePersistedLocation).toHaveBeenCalled());
    expect(readPersistedLocation).toHaveBeenCalledWith("0xabc");
    expect(writePersistedLocation.mock.calls[0]?.[0]).toMatchObject({ owner: "0xabc" });
  });

  it("drops a persisted fix in the same render the owner changes", async () => {
    // A connected wallet whose session expired flips to guest. The previous
    // owner's position must not survive even one render.
    readPersistedLocation.mockImplementation((owner: string) =>
      owner === "0xabc" ? PERSISTED : null,
    );
    const { result, rerender } = renderHook(({ owner }) => useMarketCamera(owner), {
      wrapper,
      initialProps: { owner: "0xabc" },
    });
    await waitFor(() => expect(result.current.camera?.rank).toBe(CAMERA_RANK.persistedGps));

    rerender({ owner: "guest" });

    expect(result.current.camera).toBeNull();
    expect(result.current.realFix).toBeNull();
  });

  it("does not leak account A's fix to account B", async () => {
    readPersistedLocation.mockImplementation((owner: string) =>
      owner === "0xaaa" ? PERSISTED : null,
    );
    const { result, rerender } = renderHook(({ owner }) => useMarketCamera(owner), {
      wrapper,
      initialProps: { owner: "0xaaa" },
    });
    await waitFor(() => expect(result.current.realFix).toEqual({ lat: -1.2, lng: 36.7 }));

    rerender({ owner: "0xbbb" });

    expect(result.current.realFix).toBeNull();
  });

  it("falls back to the IP camera once the previous owner's fix is dropped", async () => {
    readPersistedLocation.mockImplementation((owner: string) =>
      owner === "0xabc" ? PERSISTED : null,
    );
    ipCameraResult.current = { data: { lat: 12, lng: 34, zoom: 11, source: "ip-city" } };
    const { result, rerender } = renderHook(({ owner }) => useMarketCamera(owner), {
      wrapper,
      initialProps: { owner: "0xabc" },
    });
    await waitFor(() => expect(result.current.camera?.rank).toBe(CAMERA_RANK.persistedGps));

    rerender({ owner: "guest" });

    expect(result.current.camera?.rank).toBe(CAMERA_RANK.ipCity);
  });
});
