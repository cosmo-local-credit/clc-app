import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import * as backendApi from "#/features/auth/api/client";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { DELEGATION_POLL_MS, useCaliburDelegateFromPk } from "./use-calibur-delegate-from-pk";

const FAKE_PK =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const FAKE_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: () => ({
    address: FAKE_ADDRESS,
    sign: vi.fn().mockResolvedValue(`0x${"11".repeat(32)}${"22".repeat(32)}1b`),
  }),
}));

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
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useCaliburDelegateFromPk", () => {
  beforeEach(() => {});

  it("waits for backend tracking completion after delegation is accepted", async () => {
    const client = createClientStub();
    (client.getEOANonce as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { nonce: "0" },
    });
    (client.delegate as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { trackingId: "tracking-1" },
    });

    const { result } = renderHook(() => useCaliburDelegateFromPk(client), {
      wrapper: createWrapper(),
    });

    vi.spyOn(backendApi, "trackOtx").mockResolvedValue({
      otx: [
        {
          id: 1,
          trackingId: "tracking-1",
          otxType: "RELAY_DELEGATE",
          txHash: "0xdeadbeef",
          nonce: 0,
          replaced: false,
          createdAt: "2026-06-18T00:00:00Z",
          status: "SUCCESS",
        },
      ],
    });

    await act(async () => {
      await result.current.mutateAsync({ privateKey: FAKE_PK });
    });

    await waitFor(() => {
      expect(backendApi.trackOtx).toHaveBeenCalledWith("tracking-1");
      expect(result.current.step).toBe("done");
      expect(result.current.isPending).toBe(false);
    });
    expect(DELEGATION_POLL_MS).toBe(2_000);
  });
});
