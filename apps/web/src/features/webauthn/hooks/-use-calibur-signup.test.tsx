import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { useCaliburSignup } from "./use-calibur-signup";

function createClientStub(): RelayerClient {
  return {
    getHealth: vi.fn(),
    getEOANonce: vi.fn(),
    getCaliburNonce: vi.fn(),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relay: vi.fn(),
  };
}

function createWrapper() {
  const queryClient = new QueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCaliburSignup", () => {
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

  it("fails cleanly when the browser credentials API is unavailable", async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useCaliburSignup(client), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.signup.mutateAsync().catch(() => undefined);
    });

    expect(result.current.step).toBe("error");
    expect(result.current.error).toBe(
      "This browser does not expose the Credentials API needed for passkeys.",
    );
    expect(client.getEOANonce).not.toHaveBeenCalled();
  });

  it("throws when relayerAddress is missing from health response", async () => {
    const client = createClientStub();
    // Provide enough stubs to get past credential creation to the health check
    (client.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { chainId: 42220 }, // relayerAddress deliberately absent
    });
    (client.getEOANonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });
    (client.getCaliburNonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });

    // Mock crypto.subtle so extractP256Coords succeeds past the SPKI import
    const importKeySpy = vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    const exportKeySpy = vi.spyOn(crypto.subtle, "exportKey").mockResolvedValue({
      x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      y: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    } as JsonWebKey);

    // Set up navigator.credentials so we get past the credentials guard
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

    const { result } = renderHook(() => useCaliburSignup(client), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.signup.mutateAsync().catch(() => undefined);
    });

    importKeySpy.mockRestore();
    exportKeySpy.mockRestore();

    expect(result.current.step).toBe("error");
    expect(result.current.error).toContain("relayerAddress");
  });
});
