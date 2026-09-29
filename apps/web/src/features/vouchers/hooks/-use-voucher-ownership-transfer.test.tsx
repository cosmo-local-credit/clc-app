import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { relayCaliburBatch, relayerClient } = vi.hoisted(() => ({
  relayCaliburBatch: vi.fn(),
  relayerClient: { kind: "test-relayer" },
}));

vi.mock("#/features/webauthn/api/relay-calibur-batch", () => ({ relayCaliburBatch }));

vi.mock("wagmi", () => ({
  useConnection: () => ({ connector: { id: "private-key" } }),
}));

vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => relayerClient,
}));

import { useVoucherOwnershipTransfer } from "./use-voucher-ownership-transfer";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const NEW_OWNER = "0x3333333333333333333333333333333333333333" as const;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useVoucherOwnershipTransfer", () => {
  it("signs and relays the current owner's transfer call", async () => {
    relayCaliburBatch.mockResolvedValue({ trackingId: "ownership-1" });
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        tokenAddress: TOKEN,
        ownerAddress: OWNER,
        newOwnerAddress: NEW_OWNER,
        includeAuthorization: true,
      }),
    );

    expect(relayCaliburBatch).toHaveBeenCalledWith(
      {
        senderAddress: OWNER,
        connectorId: "private-key",
        calls: [expect.objectContaining({ to: TOKEN, value: "0" })],
        includeAuthorization: true,
      },
      relayerClient,
    );
  });
});
