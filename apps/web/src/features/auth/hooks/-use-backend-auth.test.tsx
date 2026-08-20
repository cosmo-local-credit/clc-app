import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockGetSiweNonce = vi.fn<() => Promise<string>>();
const mockSignupWithSiwe = vi.fn();
const mockSigninWithSiwe = vi.fn();
const mockSubmitProfile = vi.fn();
const mockSignMessage = vi.fn<() => Promise<`0x${string}`>>();
const mockGetStorageToken = vi.fn();
const mockUpload = vi.fn();

vi.mock("@clc/api/features/auth/client", () => ({
  getSiweNonce: () => mockGetSiweNonce(),
  signupWithSiwe: (payload: unknown) => mockSignupWithSiwe(payload),
  signinWithSiwe: (payload: unknown) => mockSigninWithSiwe(payload),
  submitProfile: (payload: unknown) => mockSubmitProfile(payload),
  getStorageToken: () => mockGetStorageToken(),
}));

vi.mock("#/lib/api/storage", () => ({
  isStorageConfigured: true,
  storageClient: () => ({ upload: (input: unknown, token: unknown) => mockUpload(input, token) }),
}));

vi.mock("wagmi/actions", () => ({
  signMessage: (_config: unknown, _opts: unknown) => mockSignMessage(),
}));

vi.mock("#/providers/web3-config", () => ({
  wagmiConfig: {},
}));

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api/auth", async () => ({
  authClient: await import("@clc/api/features/auth/client"),
}));

// QueryClient wrapper for useMutation
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

import {
  useBackendPrivateKeySignin,
  useBackendSignup,
  useBackendWalletSignin,
} from "./use-backend-auth";

const FAKE_PK =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;

const LOCATION = {
  lat: -1.286,
  lng: 36.817,
  locationName: "Nairobi",
  country: "KE",
};

beforeEach(() => {
  mockGetSiweNonce.mockResolvedValue("testNonce1234");
  mockSignupWithSiwe.mockResolvedValue({ userId: 1, status: "PENDING", role: "USER" });
  mockSigninWithSiwe.mockResolvedValue({ userId: 1, role: "USER" });
  mockSubmitProfile.mockResolvedValue(undefined);
  mockSignMessage.mockResolvedValue("0xsignature");
  mockGetStorageToken.mockResolvedValue({
    token: "storage-token",
    expiresAt: "2026-09-19T10:00:00Z",
  });
  mockUpload.mockResolvedValue({
    url: "https://cdn.test/profile/abc_400_a3f91c2e.webp",
    width: 400,
    height: 400,
    byteSize: 6516,
    contentType: "image/webp",
  });
  // jsdom doesn't set window.location
  Object.defineProperty(window, "location", {
    value: { host: "localhost", origin: "http://localhost" },
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useBackendSignup", () => {
  it("uses getSiweNonce() result in the SIWE message", async () => {
    const { result } = renderHook(() => useBackendSignup(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      profile: { name: "Alice", email: "a@b.com", phone: "+254700000000", location: LOCATION },
      privateKey: FAKE_PK,
    });
    expect(mockGetSiweNonce).toHaveBeenCalledOnce();
    const payload = mockSignupWithSiwe.mock.calls[0]?.[0] as { message: string };
    expect(payload.message).toContain("testNonce1234");
  });

  it("uses pending+address@clc.local email fallback when email is blank", async () => {
    const { result } = renderHook(() => useBackendSignup(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      profile: { name: "Alice", email: "   ", phone: "+254700000000", location: LOCATION },
      privateKey: FAKE_PK,
    });
    const payload = mockSignupWithSiwe.mock.calls[0]?.[0] as { email: string };
    expect(payload.email).toMatch(/^pending\+[a-f0-9]+@clc\.local$/);
  });

  it("uses the provided email when it is non-blank", async () => {
    const { result } = renderHook(() => useBackendSignup(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      profile: {
        name: "Alice",
        email: "alice@example.com",
        phone: "+254700000000",
        location: LOCATION,
      },
      privateKey: FAKE_PK,
    });
    const payload = mockSignupWithSiwe.mock.calls[0]?.[0] as { email: string };
    expect(payload.email).toBe("alice@example.com");
  });

  it("persists phone and location via submitProfile after signup", async () => {
    const { result } = renderHook(() => useBackendSignup(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      profile: {
        name: "Alice",
        email: "alice@example.com",
        phone: "+254700000000",
        location: LOCATION,
      },
      privateKey: FAKE_PK,
    });
    expect(mockSubmitProfile).toHaveBeenCalledOnce();
    const payload = mockSubmitProfile.mock.calls[0]?.[0] as {
      name: string;
      email: string;
      phone: string;
      country: string;
      locationName: string;
      geoLat: number;
      geoLng: number;
    };
    expect(payload.phone).toBe("+254700000000");
    expect(payload.email).toBe("alice@example.com");
    expect(payload.country).toBe("KE");
    expect(payload.locationName).toBe("Nairobi");
    expect(payload.geoLat).toBe(-1.286);
    expect(payload.geoLng).toBe(36.817);
  });

  it("on already-registered 409: signs in then submits the full (edited) profile", async () => {
    mockSignupWithSiwe.mockResolvedValue({
      userId: null,
      status: "REGISTERED",
      role: "USER",
      alreadyRegistered: true,
    });
    const { result } = renderHook(() => useBackendSignup(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      profile: {
        name: "Alice Edited",
        email: "alice@example.com",
        phone: "+254711111111",
        location: LOCATION,
      },
      privateKey: FAKE_PK,
    });
    // Fresh SIWE nonce for sign-in after the signup 409.
    expect(mockGetSiweNonce).toHaveBeenCalledTimes(2);
    expect(mockSigninWithSiwe).toHaveBeenCalledOnce();
    expect(mockSubmitProfile).toHaveBeenCalledOnce();
    const payload = mockSubmitProfile.mock.calls[0]?.[0] as {
      name: string;
      phone: string;
      country: string;
      locationName: string;
      geoLat: number;
      geoLng: number;
    };
    expect(payload.name).toBe("Alice Edited");
    expect(payload.phone).toBe("+254711111111");
    expect(payload.country).toBe("KE");
    expect(payload.locationName).toBe("Nairobi");
    expect(payload.geoLat).toBe(-1.286);
    expect(payload.geoLng).toBe(36.817);
  });
});

describe("useBackendPrivateKeySignin", () => {
  it("calls signinWithSiwe with message containing the nonce", async () => {
    const { result } = renderHook(() => useBackendPrivateKeySignin(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ privateKey: FAKE_PK });
    const payload = mockSigninWithSiwe.mock.calls[0]?.[0] as { message: string };
    expect(payload.message).toContain("testNonce1234");
  });
});

describe("useBackendWalletSignin", () => {
  it("throws 'Wallet not connected' when address is undefined", async () => {
    const { result } = renderHook(() => useBackendWalletSignin(undefined, undefined), {
      wrapper: createWrapper(),
    });
    await expect(result.current.mutateAsync()).rejects.toThrow("Wallet not connected");
    expect(mockGetSiweNonce).not.toHaveBeenCalled();
  });

  it("calls signinWithSiwe when address is defined", async () => {
    const addr = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const { result } = renderHook(() => useBackendWalletSignin(addr, 42220), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync();
    expect(mockSigninWithSiwe).toHaveBeenCalledOnce();
    const payload = mockSigninWithSiwe.mock.calls[0]?.[0] as { message: string };
    expect(payload.message).toContain("testNonce1234");
  });
});

describe("useBackendSignup — onboarding photo", () => {
  const photo = () => new File([new Uint8Array(64)], "me.jpg", { type: "image/jpeg" });

  const signUp = async (avatarFile: File | null) => {
    const { result } = renderHook(() => useBackendSignup(), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      profile: { name: "Alice", email: "a@b.com", phone: "+254700000000", location: LOCATION },
      privateKey: FAKE_PK,
      avatarFile,
    });
  };

  it("uploads the photo and saves the URL with the profile", async () => {
    await signUp(photo());

    const [input, token] = mockUpload.mock.calls[0] as [
      { purpose: string; uploadId: string },
      string,
    ];
    expect(input.purpose).toBe("profile.avatar");
    // 32 opaque characters, so the object key carries no identity.
    expect(input.uploadId).toMatch(/^[0-9a-f]{32}$/);
    expect(token).toBe("storage-token");

    const profile = mockSubmitProfile.mock.calls[0]?.[0] as { avatarUrl?: string };
    expect(profile.avatarUrl).toBe("https://cdn.test/profile/abc_400_a3f91c2e.webp");
  });

  it("only uploads once a session exists", async () => {
    await signUp(photo());

    // The token can only be fetched with the session cookie signup just set, so
    // the order here is the whole reason the upload does not live on the profile
    // step.
    expect(mockSignupWithSiwe).toHaveBeenCalled();
    const signupAt = mockSignupWithSiwe.mock.invocationCallOrder[0] ?? 0;
    const tokenAt = mockGetStorageToken.mock.invocationCallOrder[0] ?? 0;
    expect(tokenAt).toBeGreaterThan(signupAt);
  });

  it("still creates the account when the upload fails", async () => {
    mockUpload.mockRejectedValue(new Error("storage unreachable"));

    await signUp(photo());

    expect(mockSubmitProfile).toHaveBeenCalledOnce();
    const profile = mockSubmitProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    // Absent, not null: null would ask clc-core to clear an avatar, and there is
    // nothing to clear.
    expect("avatarUrl" in profile).toBe(false);
  });

  it("does not reach the upload service when no photo was chosen", async () => {
    await signUp(null);

    expect(mockGetStorageToken).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    const profile = mockSubmitProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect("avatarUrl" in profile).toBe(false);
  });

  it("uploads after the sign-in fallback on an already-registered address", async () => {
    mockSignupWithSiwe.mockResolvedValue({
      userId: null,
      status: "REGISTERED",
      role: "USER",
      alreadyRegistered: true,
    });

    await signUp(photo());

    const signinAt = mockSigninWithSiwe.mock.invocationCallOrder[0] ?? 0;
    const tokenAt = mockGetStorageToken.mock.invocationCallOrder[0] ?? 0;
    expect(tokenAt).toBeGreaterThan(signinAt);
  });
});
