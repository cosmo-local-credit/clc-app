import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
  execute: vi.fn(),
  delegation: "delegated" as "checking" | "delegated" | "not-delegated",
}));
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({
    address: "0x3333333333333333333333333333333333333333",
    connector: { id: "private-key" },
  }),
  useSignTypedData: () => ({ signTypedDataAsync: vi.fn() }),
}));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100, CHAIN_INFO: {} }));
vi.mock("#/lib/relayer-config", () => ({ RELAYER_URL: "https://relayer.example" }));
vi.mock("#/lib/api/safe", () => ({ safeClient: {} }));
vi.mock("@clc/api/features/relayer/client", () => ({ createRelayerClient: () => ({}) }));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => mocks.delegation,
}));
vi.mock("../api/safe-transactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/safe-transactions")>()),
  proposeSafeTransaction: mocks.propose,
  executeSafeTransaction: mocks.execute,
}));

import { SafeProposedError } from "../api/safe-transactions";
import { safeSubmissionKey, useSafeSubmissions } from "../state/safe-submissions";
import { useSafeWrite } from "./use-safe-write";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const ASSET = "0x2222222222222222222222222222222222222222" as const;
const calls = [{ to: ASSET, value: "0", data: "0xf2fde38b" as const }];

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const proposal = (confirmed: number, required: number) => ({
  safe: SAFE,
  safeTxHash: `0x${"ab".repeat(32)}`,
  nonce: "5",
  confirmations: Array.from({ length: confirmed }, (_, i) => ({
    owner: `0x${i}`,
    signature: "0x",
  })),
  confirmationsRequired: required,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.delegation = "delegated";
  useSafeSubmissions.setState({ submissions: {} });
  mocks.execute.mockResolvedValue({ trackingId: "t1", txHash: "0xdone" });
});

describe("useSafeWrite.write", () => {
  it("signs and executes in one action at threshold 1", async () => {
    mocks.propose.mockResolvedValue(proposal(1, 1));
    const { result } = renderHook(() => useSafeWrite(), { wrapper });

    await expect(
      result.current.write({ assetAddress: ASSET, safe: SAFE, threshold: 1, calls }),
    ).resolves.toEqual({ trackingId: "t1", txHash: "0xdone" });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(useSafeSubmissions.getState().submissions[safeSubmissionKey(ASSET)]).toBeUndefined();
  });

  it("stops after the proposal above threshold and remembers it for a reload", async () => {
    mocks.propose.mockResolvedValue(proposal(1, 2));
    const { result } = renderHook(() => useSafeWrite(), { wrapper });

    await expect(
      result.current.write({ assetAddress: ASSET, safe: SAFE, threshold: 2, calls }),
    ).rejects.toBeInstanceOf(SafeProposedError);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(useSafeSubmissions.getState().submissions[safeSubmissionKey(ASSET)]).toMatchObject({
      safe: SAFE,
      safeTxHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("waits for the wallet check before asking for a signature", async () => {
    mocks.delegation = "checking";
    const { result } = renderHook(() => useSafeWrite(), { wrapper });

    await expect(
      result.current.write({ assetAddress: ASSET, safe: SAFE, threshold: 1, calls }),
    ).rejects.toThrow(/Still checking/);
    expect(mocks.propose).not.toHaveBeenCalled();
  });
});
