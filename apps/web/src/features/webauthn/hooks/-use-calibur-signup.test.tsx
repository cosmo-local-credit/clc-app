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
});
