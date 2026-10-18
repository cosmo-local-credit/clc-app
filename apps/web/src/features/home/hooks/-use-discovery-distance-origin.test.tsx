import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  profile: { data: undefined as { geoLat?: unknown; geoLng?: unknown } | undefined },
  realFix: { lat: -1.2, lng: 36.8 } as { lat: number; lng: number } | null,
  profileEnabled: false,
  cameraOwner: "",
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => mocks.auth,
}));
vi.mock("#/features/auth/hooks/use-profile", () => ({
  useAuthProfile: ({ enabled }: { enabled: boolean }) => {
    mocks.profileEnabled = enabled;
    return mocks.profile;
  },
}));
vi.mock("#/lib/discovery-location", () => ({
  useDiscoveryLocation: (owner: string) => {
    mocks.cameraOwner = owner;
    return { realFix: mocks.realFix };
  },
}));

import { useDiscoveryDistanceOrigin } from "./use-discovery-distance-origin";

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.auth.isLoading = false;
  mocks.profile.data = undefined;
  mocks.realFix = { lat: -1.2, lng: 36.8 };
});

describe("useDiscoveryDistanceOrigin", () => {
  it("uses a guest's real device fix and never loads a private profile", () => {
    const { result } = renderHook(() => useDiscoveryDistanceOrigin("guest"));
    expect(result.current).toEqual({ lat: -1.2, lng: 36.8 });
    expect(mocks.profileEnabled).toBe(false);
    expect(mocks.cameraOwner).toBe("guest");
  });

  it("withholds a guest fix while authentication is unresolved", () => {
    mocks.auth.isLoading = true;
    const { result } = renderHook(() => useDiscoveryDistanceOrigin("guest"));
    expect(result.current).toBeNull();
  });

  it("uses the saved profile for a signed-in user instead of device location", () => {
    mocks.auth.isAuthenticated = true;
    mocks.profile.data = { geoLat: -3.63, geoLng: 39.85 };
    const { result } = renderHook(() => useDiscoveryDistanceOrigin("0xabc"));
    expect(result.current).toEqual({ lat: -3.63, lng: 39.85 });
    expect(mocks.profileEnabled).toBe(true);
  });

  it.each([
    [{ geoLat: Number.NaN, geoLng: 1 }],
    [{ geoLat: 91, geoLng: 1 }],
    [{ geoLat: 1, geoLng: 181 }],
    [{ geoLat: "1", geoLng: 1 }],
  ])("does not invent a distance from an invalid saved location", (data) => {
    mocks.auth.isAuthenticated = true;
    mocks.profile.data = data;
    const { result } = renderHook(() => useDiscoveryDistanceOrigin("0xabc"));
    expect(result.current).toBeNull();
  });
});
