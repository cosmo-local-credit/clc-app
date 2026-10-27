import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DiscoveryLocationProvider, useDiscoveryLocation } from "./discovery-location";
import { useMarketCamera } from "#/features/home/hooks/use-market-camera";
import { writePersistedLocation } from "#/features/home/api/last-location-storage";

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
  return (
    <>
      <output data-testid="location">{JSON.stringify(location.realFix)}</output>
      <output data-testid="camera">{JSON.stringify(camera.realFix)}</output>
      <button onClick={camera.requestLocation}>Refresh GPS</button>
    </>
  );
}
it("shares GPS refresh with the map even when persistence fails", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(
    <DiscoveryLocationProvider owner="guest">
      <Probe />
    </DiscoveryLocationProvider>,
  );
  await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
  fix(0, 0, 0);
  fireEvent.click(screen.getByText("Refresh GPS"));
  expect(screen.getByTestId("location").textContent).toBe('{"lat":0,"lng":0}');
  fix(1, 10, 20);
  expect(screen.getByTestId("camera").textContent).toBe('{"lat":10,"lng":20}');
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
it("waits for IP resolution, then uses an IP city without prompting", async () => {
  query.mockResolvedValue({ state: "prompt" });
  const tree = () => (
    <DiscoveryLocationProvider owner="guest">
      <Probe />
    </DiscoveryLocationProvider>
  );
  const view = render(tree());
  expect(screen.getByRole("button", { name: "Refresh GPS" })).toBeTruthy();
  await waitFor(() => expect(query).toHaveBeenCalled());
  expect(getCurrentPosition).not.toHaveBeenCalled();
  mocks.ip = { data: { source: "ip-city", lat: 3, lng: 4 }, isPending: false };
  view.rerender(tree());
  expect(screen.getByTestId("camera").textContent).toBe("null");
});

it("does not reuse a previous account's precise location after the session becomes guest", async () => {
  query.mockResolvedValue({ state: "prompt" });
  writePersistedLocation({
    owner: "0xprevious",
    lat: 10,
    lng: 20,
    accuracy: 5,
    capturedAt: new Date().toISOString(),
  });
  mocks.ip = {
    data: { source: "ip-city", lat: -1.2921, lng: 36.8219 },
    isPending: false,
  };

  render(
    <DiscoveryLocationProvider owner="guest">
      <Probe />
    </DiscoveryLocationProvider>,
  );

  await waitFor(() => expect(query).toHaveBeenCalled());
  expect(screen.getByTestId("location").textContent).toBe("null");
  expect(getCurrentPosition).not.toHaveBeenCalled();
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
