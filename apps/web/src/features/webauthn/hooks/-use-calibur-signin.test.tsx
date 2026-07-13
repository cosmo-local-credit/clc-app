import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendApiError } from "#/features/auth/api/client";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";

const { collectWebAuthnAssertion, signinWithWebAuthn, storeWebAuthnCredential } = vi.hoisted(
  () => ({
    collectWebAuthnAssertion: vi.fn(),
    signinWithWebAuthn: vi.fn(),
    storeWebAuthnCredential: vi.fn(),
  }),
);

vi.mock("#/features/webauthn/hooks/assertion", () => ({ collectWebAuthnAssertion }));
vi.mock("#/lib/webauthn-storage", () => ({ storeWebAuthnCredential }));
vi.mock("#/features/auth/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/auth/api/client")>();
  return { ...actual, signinWithWebAuthn };
});

import { useCaliburSignin } from "./use-calibur-signin";

const client = {} as RelayerClient;

function createWrapper() {
  const queryClient = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  collectWebAuthnAssertion.mockReset();
  signinWithWebAuthn.mockReset();
  storeWebAuthnCredential.mockReset();
});

describe("useCaliburSignin", () => {
  it("verifies the assertion then stores the recovered credential", async () => {
    collectWebAuthnAssertion.mockResolvedValue({
      credentialId: "cred-1",
      authenticatorData: "ad",
      clientDataJSON: "cdj",
      signature: "sig",
    });
    signinWithWebAuthn.mockResolvedValue({
      userId: 1,
      role: "USER",
      address: "0xabc",
      keyHash: "0xkey",
      publicKeyX: "11",
      publicKeyY: "22",
    });

    const { result } = renderHook(() => useCaliburSignin(client), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signin.mutateAsync();
    });

    expect(signinWithWebAuthn).toHaveBeenCalledWith({
      credentialId: "cred-1",
      authenticatorData: "ad",
      clientDataJSON: "cdj",
      signature: "sig",
    });
    expect(storeWebAuthnCredential).toHaveBeenCalledWith({
      credentialId: "cred-1",
      keyHash: "0xkey",
      publicKeyX: "11",
      publicKeyY: "22",
      address: "0xabc",
    });
    await waitFor(() => expect(result.current.step).toBe("done"));
  });

  it("surfaces a BackendApiError and does not store a credential", async () => {
    collectWebAuthnAssertion.mockResolvedValue({
      credentialId: "cred-1",
      authenticatorData: "ad",
      clientDataJSON: "cdj",
      signature: "sig",
    });
    signinWithWebAuthn.mockRejectedValue(new BackendApiError(404, "not registered", "E03"));

    const { result } = renderHook(() => useCaliburSignin(client), { wrapper: createWrapper() });

    const err = await act(async () => result.current.signin.mutateAsync().catch((e: unknown) => e));

    expect(err).toBeInstanceOf(BackendApiError);
    expect(storeWebAuthnCredential).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.step).toBe("error"));
  });
});
