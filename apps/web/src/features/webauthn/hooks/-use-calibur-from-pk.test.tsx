import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburFromPk } from "./use-calibur-from-pk";

const FAKE_PK =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;

function createClientStub(): RelayerClient {
  return {
    getHealth: vi.fn(),
    getEOANonce: vi.fn(),
    getCaliburNonce: vi.fn(),
    trackRelay: vi.fn(),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi.fn(),
    relay: vi.fn(),
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCaliburFromPk", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredentialMock {},
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: undefined,
    });
  });

  it("waits for backend tracking completion after relay acceptance", async () => {
    const client = createClientStub();
    (client.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { chainId: 42220, relayerAddress: "0x1234567890123456789012345678901234567890" },
    });
    (client.getEOANonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });
    (client.getCaliburNonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });
    (client.relay as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { trackingId: "tracking-1" },
    });

    const importKeySpy = vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    const exportKeySpy = vi.spyOn(crypto.subtle, "exportKey").mockResolvedValue({
      x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      y: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    } as JsonWebKey);

    const fakeCredential = {
      id: "cred-1",
      response: {
        getPublicKey: () => new Uint8Array([0x04, ...Array.from({ length: 64 }, () => 0)]).buffer,
        getPublicKeyAlgorithm: () => -7,
      },
    };
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create: vi.fn().mockResolvedValue(fakeCredential) },
    });

    const { result } = renderHook(() => useCaliburFromPk(FAKE_PK, client), {
      wrapper: createWrapper(),
    });

    (client.trackRelay as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: {
        otx: [
          {
            id: 1,
            trackingId: "tracking-1",
            otxType: "RELAY_DELEGATE_EXEC",
            txHash: "0xdeadbeef",
            nonce: 0,
            replaced: false,
            createdAt: "2026-06-18T00:00:00Z",
            status: "SUCCESS",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.upgradeAndLink.mutateAsync();
    });

    importKeySpy.mockRestore();
    exportKeySpy.mockRestore();

    await waitFor(() => {
      expect(client.trackRelay).toHaveBeenCalledWith("tracking-1");
      expect(result.current.step).toBe("done");
    });
  });

  it("throws when relayerAddress is missing from health response", async () => {
    const client = createClientStub();
    (client.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { chainId: 42220 },
    });
    (client.getEOANonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });
    (client.getCaliburNonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });

    const importKeySpy = vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    const exportKeySpy = vi.spyOn(crypto.subtle, "exportKey").mockResolvedValue({
      x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      y: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    } as JsonWebKey);

    const fakeCredential = {
      response: {
        getPublicKey: () => new Uint8Array([0x04, ...Array.from({ length: 64 }, () => 0)]).buffer,
        getPublicKeyAlgorithm: () => -7,
      },
    };
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create: vi.fn().mockResolvedValue(fakeCredential) },
    });

    const { result } = renderHook(() => useCaliburFromPk(FAKE_PK, client), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.upgradeAndLink.mutateAsync().catch(() => undefined);
    });

    importKeySpy.mockRestore();
    exportKeySpy.mockRestore();

    expect(result.current.step).toBe("error");
    expect(result.current.error).toContain("relayerAddress");
  });
});
