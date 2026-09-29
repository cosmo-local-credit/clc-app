import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { exactInputRelay, exactOutputRelay, relayerClient } = vi.hoisted(() => ({
  exactInputRelay: vi.fn(),
  exactOutputRelay: vi.fn(),
  relayerClient: { kind: "test-relayer" },
}));

vi.mock("#/features/wallet/api/pool-swap-relay", () => ({
  relayPoolSwapExactInput: exactInputRelay,
  relayPoolSwapExactOutput: exactOutputRelay,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ connector: { id: "private-key" } }),
}));

vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => relayerClient,
}));

import { usePoolSwapTransfer } from "./use-pool-swap-transfer";

const SENDER = "0x1111111111111111111111111111111111111111" as const;
const POOL = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_IN = "0x3333333333333333333333333333333333333333" as const;
const TOKEN_OUT = "0x4444444444444444444444444444444444444444" as const;
const path = [{ poolAddress: POOL, tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT }];

function createWrapper() {
  const queryClient = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePoolSwapTransfer", () => {
  it("relays an exact-input quote through the exact-input batch", async () => {
    exactInputRelay.mockResolvedValue({ trackingId: "exact-input-1" });
    const { result } = renderHook(() => usePoolSwapTransfer(), { wrapper: createWrapper() });

    await act(() =>
      result.current.mutateAsync({
        mode: "exact-input",
        senderAddress: SENDER,
        path,
        hopAmountIns: ["125"],
        includeAuthorization: true,
      }),
    );

    expect(exactInputRelay).toHaveBeenCalledWith(
      {
        senderAddress: SENDER,
        connectorId: "private-key",
        path,
        hopAmountIns: ["125"],
        includeAuthorization: true,
      },
      relayerClient,
    );
    expect(exactOutputRelay).not.toHaveBeenCalled();
  });

  it("relays an exact-output quote through the exact-output batch", async () => {
    exactOutputRelay.mockResolvedValue({ trackingId: "exact-output-1" });
    const { result } = renderHook(() => usePoolSwapTransfer(), { wrapper: createWrapper() });

    await act(() =>
      result.current.mutateAsync({
        mode: "exact-output",
        senderAddress: SENDER,
        path,
        hopAmountIns: ["250"],
      }),
    );

    expect(exactOutputRelay).toHaveBeenCalledWith(
      {
        senderAddress: SENDER,
        connectorId: "private-key",
        path,
        hopAmountIns: ["250"],
        includeAuthorization: undefined,
      },
      relayerClient,
    );
    expect(exactInputRelay).not.toHaveBeenCalled();
  });
});
