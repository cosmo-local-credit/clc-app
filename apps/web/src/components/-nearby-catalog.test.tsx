import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";
import {
  clearMarketDiscoveryArea,
  NearbyCatalog,
  nearbyQueryKey,
  useMarketDiscoveryArea,
  useNearbyCatalog,
} from "./nearby-catalog";

vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: vi.fn() }));

const useAuthStatusMock = vi.mocked(useAuthStatus);
const AREA_NAME = "market-discovery-area.v1";
const BOUNDS = [{ minLng: 36.7, minLat: -1.4, maxLng: 37.1, maxLat: -1.1 }] as const;

beforeEach(() => {
  window.localStorage.clear();
  useAuthStatusMock.mockReturnValue({
    state: "authenticated",
    isAuthenticated: true,
    isLoading: false,
    needsBackendSignin: false,
    address: "0xAaA",
    chainId: 100,
    connectorId: "test",
    session: { address: "0xAaA", chainId: 100, role: "USER" },
    error: null,
    retry: vi.fn(),
    retrying: false,
  });
});

afterEach(cleanup);

function Probe() {
  const nearby = useNearbyCatalog();
  const { area, setArea } = useMarketDiscoveryArea();
  return (
    <div>
      <output data-testid="scope">{nearby?.scope}</output>
      <output data-testid="bounds">{JSON.stringify(nearby?.bounds ?? [])}</output>
      <output data-testid="camera">
        {area ? `${area.center.lat}:${area.center.lng}:${area.zoom}` : "global"}
      </output>
      <button
        type="button"
        onClick={() => setArea({ center: { lat: -1.25, lng: 36.9 }, zoom: 11.2344, boxes: BOUNDS })}
      >
        Set area
      </button>
      <button
        type="button"
        onClick={() =>
          setArea({
            center: { lat: -1.2500001, lng: 36.9000001 },
            zoom: 11.23439,
            boxes: BOUNDS,
          })
        }
      >
        Set equivalent area
      </button>
    </div>
  );
}

function mount(children: ReactNode = <Probe />) {
  return render(<NearbyCatalog>{children}</NearbyCatalog>);
}

it("uses Global until the map establishes an area", async () => {
  mount();
  expect((await screen.findByTestId("camera")).textContent).toBe("global");
  expect(screen.getByTestId("scope").textContent).toBe("viewport:0xaaa:global");
  expect(screen.getByTestId("bounds").textContent).toBe("[]");
});

it("persists canonical settled camera state and supplies exact bounds", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Set area" }));

  expect(screen.getByTestId("camera").textContent).toBe("-1.25:36.9:11.234");
  expect(screen.getByTestId("bounds").textContent).toBe(JSON.stringify(BOUNDS));
  const stored = window.localStorage.getItem(ownerScopedKey("0xaaa", AREA_NAME));
  expect(JSON.parse(stored ?? "null")).toMatchObject({
    owner: "0xaaa",
    center: { lat: -1.25, lng: 36.9 },
    zoom: 11.234,
    boxes: BOUNDS,
  });

  cleanup();
  mount();
  expect((await screen.findByTestId("camera")).textContent).toBe("-1.25:36.9:11.234");
});

it("does not rewrite equivalent settled state", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Set area" }));
  const writes = setItem.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Set equivalent area" }));
  expect(setItem).toHaveBeenCalledTimes(writes);
  setItem.mockRestore();
});

it("isolates areas by wallet and clears only the signed-in owner", async () => {
  const view = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Set area" }));

  useAuthStatusMock.mockReturnValue({
    state: "guest",
    isAuthenticated: false,
    isLoading: false,
    needsBackendSignin: false,
    address: undefined,
    chainId: 100,
    connectorId: undefined,
    session: null,
    error: null,
    retry: vi.fn(),
    retrying: false,
  });
  view.rerender(
    <NearbyCatalog>
      <Probe />
    </NearbyCatalog>,
  );
  expect((await screen.findByTestId("camera")).textContent).toBe("global");
  expect(window.localStorage.getItem(ownerScopedKey("0xaaa", AREA_NAME))).not.toBeNull();

  act(() => clearMarketDiscoveryArea("0xaaa"));
  expect(window.localStorage.getItem(ownerScopedKey("0xaaa", AREA_NAME))).toBeNull();
});

it("removes corrupt saved areas and the obsolete radius preference", async () => {
  window.localStorage.setItem(ownerScopedKey("0xaaa", AREA_NAME), "{bad");
  window.localStorage.setItem("clc.catalog-visibility.v1", "50");
  mount();

  await waitFor(() => expect(screen.getByTestId("camera").textContent).toBe("global"));
  expect(window.localStorage.getItem(ownerScopedKey("0xaaa", AREA_NAME))).toBeNull();
  expect(window.localStorage.getItem("clc.catalog-visibility.v1")).toBeNull();
});

it("rejects partially valid and overlong persisted viewport arrays", async () => {
  const key = ownerScopedKey("0xaaa", AREA_NAME);
  const valid = { minLng: 36, minLat: -2, maxLng: 37, maxLat: -1 };
  for (const boxes of [
    [valid, { minLng: Number.NaN, minLat: -2, maxLng: 38, maxLat: -1 }],
    [valid, valid, valid],
  ]) {
    cleanup();
    window.localStorage.setItem(
      key,
      JSON.stringify({ owner: "0xaaa", center: { lat: -1.5, lng: 36.5 }, zoom: 10, boxes }),
    );
    mount();
    await waitFor(() => expect(screen.getByTestId("camera").textContent).toBe("global"));
    expect(window.localStorage.getItem(key)).toBeNull();
  }
});

it("rejects a persisted whole-world viewport instead of submitting a world bbox", async () => {
  const key = ownerScopedKey("0xaaa", AREA_NAME);
  window.localStorage.setItem(
    key,
    JSON.stringify({
      owner: "0xaaa",
      center: { lat: 0, lng: 0 },
      zoom: 0,
      boxes: [{ minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 }],
    }),
  );
  mount();

  await waitFor(() => expect(screen.getByTestId("camera").textContent).toBe("global"));
  expect(screen.getByTestId("bounds").textContent).toBe("[]");
  expect(window.localStorage.getItem(key)).toBeNull();
});

it("does not expose either owner tier while the session is unresolved", () => {
  useAuthStatusMock.mockReturnValue({
    state: "loading",
    isAuthenticated: false,
    isLoading: true,
    needsBackendSignin: false,
    address: undefined,
    chainId: 100,
    connectorId: undefined,
    session: undefined,
    error: null,
    retry: vi.fn(),
    retrying: false,
  });
  mount();
  expect(screen.queryByTestId("camera")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Loading…");
});

it("includes the viewport scope in discovery query keys", () => {
  expect(
    nearbyQueryKey(["catalog"] as const, {
      nearby: false,
      scope: "viewport:guest:box",
      bounds: BOUNDS,
    }),
  ).toEqual(["catalog", "viewport:guest:box"]);
});
