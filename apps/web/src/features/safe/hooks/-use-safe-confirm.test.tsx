import { computeSafeTxHash, type SafeTransaction } from "@clc/core/features/safe/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111";
const ME = "0x3333333333333333333333333333333333333333";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), sign: vi.fn() }));
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({ address: ME, connector: { id: "private-key" } }),
  useSignTypedData: () => ({ signTypedDataAsync: mocks.sign }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: ME } }),
}));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
vi.mock("#/lib/api/safe", () => ({ safeClient: { confirm: mocks.confirm } }));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));

import { useSafeConfirm } from "./use-safe-confirm";

const tx: SafeTransaction = {
  to: "0x2222222222222222222222222222222222222222",
  value: "0",
  data: "0x",
  operation: 0,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
  nonce: "4",
};
const proposal = (safeTxHash: string) => ({
  ...tx,
  safe: SAFE,
  safeTxHash,
  confirmations: [],
  confirmationsRequired: 2,
  isExecuted: false,
  isSuccessful: null,
  transactionHash: null,
});

function hook() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSafeConfirm(), { wrapper }).result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sign.mockResolvedValue(`0x${"11".repeat(65)}`);
  mocks.confirm.mockResolvedValue({});
});

describe("useSafeConfirm", () => {
  it("signs the digest it can reproduce and sends the confirmation", async () => {
    const hash = computeSafeTxHash(100, SAFE, tx);
    await hook().current.mutateAsync(proposal(hash));
    expect(mocks.sign).toHaveBeenCalledOnce();
    expect(mocks.confirm).toHaveBeenCalledWith({
      safeTxHash: hash,
      signature: `0x${"11".repeat(65)}`,
    });
  });

  it("never signs a proposal whose hash it cannot reproduce", async () => {
    await expect(hook().current.mutateAsync(proposal(`0x${"ab".repeat(32)}`))).rejects.toThrow(
      "This transaction can only be confirmed in Safe.",
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
