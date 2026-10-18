import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DiscoveryLocationProvider, useDiscoveryLocation } from "./discovery-location";
import { useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { NearbyCatalog, useNearbyCatalogFilter } from "#/components/nearby-catalog";
import { useCatalogVisibilityStore } from "#/features/home/state/catalog-visibility";

const mocks = vi.hoisted(() => ({
  ip: {
    data: undefined as undefined | { source: string; lat: number; lng: number },
    isPending: true,
  },
}));
vi.mock("#/features/home/hooks/use-ip-camera", () => ({ useIPCamera: () => mocks.ip }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => ({}) }));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
const requests: PositionCallback[] = [];
const getCurrentPosition = vi.fn((success: PositionCallback) => {
  requests.push(success);
});
const query = vi.fn();
beforeEach(() => {
  requests.length = 0;
  getCurrentPosition.mockClear();
  query.mockResolvedValue({ state: "granted" });
  mocks.ip = { data: undefined, isPending: true };
  window.localStorage.clear();
  useCatalogVisibilityStore.setState({ visibility: "500" });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition }, permissions: { query } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fix(index: number, lat: number, lng: number) {
  act(() =>
    requests[index]!({
      coords: { latitude: lat, longitude: lng, accuracy: 10 },
    } as GeolocationPosition),
  );
}
function Probe({ owner = "guest" }: { owner?: string }) {
  const location = useDiscoveryLocation(owner);
  const camera = useMarketCamera(owner);
  const filter = useNearbyCatalogFilter();
  return (
    <>
      <output data-testid="location">{JSON.stringify(location.realFix)}</output>
      <output data-testid="camera">{JSON.stringify(camera.realFix)}</output>
      <output data-testid="filter">{JSON.stringify(filter)}</output>
      <button onClick={camera.requestLocation}>Refresh GPS</button>
    </>
  );
}
it("shares GPS refresh with the map and radius even when persistence fails", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(
    <DiscoveryLocationProvider owner="guest">
      <NearbyCatalog>
        <Probe />
      </NearbyCatalog>
    </DiscoveryLocationProvider>,
  );
  await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
  fix(0, 0, 0);
  expect(screen.getByTestId("filter").textContent).toBe('{"lat":0,"lng":0,"radiusKm":500}');
  fireEvent.click(screen.getByText("Refresh GPS"));
  expect(screen.getByTestId("location").textContent).toBe('{"lat":0,"lng":0}');
  fix(1, 10, 20);
  expect(screen.getByTestId("filter").textContent).toBe('{"lat":10,"lng":20,"radiusKm":500}');
  expect(screen.getByTestId("camera").textContent).toBe('{"lat":10,"lng":20}');
  act(() => useCatalogVisibilityStore.getState().setVisibility("50"));
  expect(screen.getByTestId("filter").textContent).toBe('{"lat":10,"lng":20,"radiusKm":50}');
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
});
it("drops live state and ignores an old owner's pending callback", async () => {
  const view = render(
    <DiscoveryLocationProvider owner="a">
      <Probe owner="a" />
    </DiscoveryLocationProvider>,
  );
  await waitFor(() => expect(requests).toHaveLength(1));
  fix(0, 1, 2);
  fireEvent.click(screen.getByText("Refresh GPS"));
  query.mockResolvedValue({ state: "prompt" });
  view.rerender(
    <DiscoveryLocationProvider owner="b">
      <Probe owner="b" />
    </DiscoveryLocationProvider>,
  );
  fix(1, 30, 40);
  expect(screen.getByTestId("location").textContent).toBe("null");
  expect(screen.getByTestId("camera").textContent).toBe("null");
});
it("uses an IP city without prompting and exposes a location action while IP is pending", async () => {
  query.mockResolvedValue({ state: "prompt" });
  const tree = () => (
    <DiscoveryLocationProvider owner="guest">
      <NearbyCatalog>
        <Probe />
      </NearbyCatalog>
    </DiscoveryLocationProvider>
  );
  const view = render(tree());
  expect(screen.getByRole("button", { name: "Use my location" })).toBeTruthy();
  await waitFor(() => expect(query).toHaveBeenCalled());
  expect(getCurrentPosition).not.toHaveBeenCalled();
  mocks.ip = { data: { source: "ip-city", lat: 3, lng: 4 }, isPending: false };
  view.rerender(tree());
  expect(screen.getByTestId("filter").textContent).toBe('{"lat":3,"lng":4,"radiusKm":500}');
  expect(screen.getByTestId("camera").textContent).toBe("null");
});

it("preserves an open form while the location owner changes", () => {
  const view = render(
    <DiscoveryLocationProvider owner="guest">
      <input aria-label="Draft" />
    </DiscoveryLocationProvider>,
  );
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "unsaved work" } });
  view.rerender(
    <DiscoveryLocationProvider owner="pending">
      <input aria-label="Draft" />
    </DiscoveryLocationProvider>,
  );
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("unsaved work");
  view.rerender(
    <DiscoveryLocationProvider owner="account">
      <input aria-label="Draft" />
    </DiscoveryLocationProvider>,
  );
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("unsaved work");
});
