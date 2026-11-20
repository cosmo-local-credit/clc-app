import { computeSafeTxHash, type SafeTransaction } from "@clc/core/features/safe/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111";
const ME = "0x3333333333333333333333333333333333333333";
const mocks = vi.hoisted(() => ({
  reject: vi.fn(),
  sign: vi.fn(),
  address: "0x3333333333333333333333333333333333333333" as string | undefined,
  authenticated: true,
}));
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({ address: mocks.address, connector: { id: "private-key" } }),
  useSignTypedData: () => ({ signTypedDataAsync: mocks.sign }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: mocks.authenticated, session: { address: ME } }),
}));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
vi.mock("#/lib/api/safe", () => ({ safeClient: { reject: mocks.reject } }));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));

import { useSafeReject } from "./use-safe-reject";

const tx: SafeTransaction = {
  to: "0x2222222222222222222222222222222222222222",
  value: "0",
  data: "0xf2fde38b",
  operation: 0,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
  nonce: "4",
};
const proposal = {
  ...tx,
  safe: SAFE,
  safeTxHash: `0x${"ab".repeat(32)}`,
  confirmations: [],
  confirmationsRequired: 2,
  isExecuted: false,
  isSuccessful: null,
  transactionHash: null,
};

function hook() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSafeReject(), { wrapper }).result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.address = ME;
  mocks.authenticated = true;
  mocks.sign.mockResolvedValue(`0x${"11".repeat(65)}`);
  mocks.reject.mockResolvedValue({});
});

describe("useSafeReject", () => {
  it("signs the canonical same-nonce no-op and targets the original proposal", async () => {
    await hook().current.mutateAsync(proposal);

    const rejection = mocks.reject.mock.calls[0]?.[1];
    expect(mocks.reject).toHaveBeenCalledWith(proposal.safeTxHash, expect.anything());
    expect(rejection.tx).toMatchObject({ to: SAFE, nonce: "4", data: "0x", value: "0" });
    expect(rejection.safeTxHash).toBe(computeSafeTxHash(100, SAFE, rejection.tx));
    expect(mocks.sign).toHaveBeenCalledOnce();
  });

  it("refuses to sign when the connected wallet is not the signed-in account", async () => {
    mocks.address = "0x4444444444444444444444444444444444444444";

    await expect(hook().current.mutateAsync(proposal)).rejects.toThrow(
      "Connect and sign in with a signer of this multisig.",
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });
});
