import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ipCameraQueryKeys, useIPCamera } from "./use-ip-camera";

const resolveIPCamera = vi.hoisted(() => vi.fn());

vi.mock("#/lib/ip-geolocation-client", () => ({
  resolveIPCamera,
}));

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

// A client with the app's real global defaults, so the test proves the hook's
// local overrides rather than a permissive test-only client.
function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

beforeEach(() => {
  resolveIPCamera.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIPCamera", () => {
  it("resolves a camera", async () => {
    resolveIPCamera.mockResolvedValue({ lat: 12, lng: 34, zoom: 11, source: "ip-city" });
    const client = newClient();

    const { result } = renderHook(() => useIPCamera(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ lat: 12, lng: 34, zoom: 11, source: "ip-city" });
  });

  it("never retries, so a failure falls through immediately", async () => {
    resolveIPCamera.mockRejectedValue(new Error("offline"));
    const client = newClient();

    const { result } = renderHook(() => useIPCamera(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(resolveIPCamera).toHaveBeenCalledTimes(1);
  });

  it("treats the result as permanently fresh, since an IP does not move mid-session", async () => {
    resolveIPCamera.mockResolvedValue({ lat: 12, lng: 34, zoom: 11, source: "ip-city" });
    const client = newClient();

    const { result, unmount } = renderHook(() => useIPCamera(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.data).toBeDefined());

    // Remount, as happens on every home-tab switch.
    unmount();
    const second = renderHook(() => useIPCamera(), { wrapper: wrapper(client) });
    await waitFor(() => expect(second.result.current.data).toBeDefined());

    expect(resolveIPCamera).toHaveBeenCalledTimes(1);
  });

  it("keeps the resolved camera well past the five-minute default GC time", async () => {
    resolveIPCamera.mockResolvedValue({ lat: 12, lng: 34, zoom: 11, source: "ip-city" });
    const client = newClient();

    const { result, unmount } = renderHook(() => useIPCamera(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    unmount();

    // The default gcTime would have dropped this after five idle minutes of
    // home-tab switching; the local override must outlive that.
    const [query] = client.getQueryCache().findAll({ queryKey: ipCameraQueryKeys.current() });
    expect(query?.options.gcTime).toBe(24 * 60 * 60_000);
    expect(query?.state.data).toEqual({ lat: 12, lng: 34, zoom: 11, source: "ip-city" });
  });
});
