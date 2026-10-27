import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ propose: vi.fn() }));
const ME = "0x3333333333333333333333333333333333333333";
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({
    address: "0x3333333333333333333333333333333333333333",
    connector: { id: "private-key" },
  }),
  useSignTypedData: () => ({ signTypedDataAsync: vi.fn() }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    session: { address: "0x3333333333333333333333333333333333333333" },
  }),
}));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100, CHAIN_INFO: {} }));
vi.mock("#/lib/api/safe", () => ({ safeClient: {} }));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));
vi.mock("../api/safe-transactions", async (original) => ({
  ...(await original<typeof import("../api/safe-transactions")>()),
  proposeSafeTransaction: mocks.propose,
}));

import { SafeDashboardRequiredError, SafeProposedError } from "../api/safe-transactions";
import { SafePasskeyUnsupportedError } from "../api/sign-safe-transaction";
import { useSafeWrite } from "./use-safe-write";

const SAFE = "0x1111111111111111111111111111111111111111";
const calls = [{ to: SAFE as `0x${string}`, value: "0", data: "0xf2fde38b" as const }];
const proposal = (required: number) => ({
  safe: SAFE,
  safeTxHash: `0x${"ab".repeat(32)}`,
  confirmations: [{ owner: ME }],
  confirmationsRequired: required,
});
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
beforeEach(() => vi.clearAllMocks());

describe("best-effort Safe proposals", () => {
  it.each([1, 2])("stops after proposing at threshold %i", async (threshold) => {
    mocks.propose.mockResolvedValue(proposal(threshold));
    const { result } = renderHook(() => useSafeWrite(), { wrapper });
    await expect(result.current.write({ safe: SAFE, calls })).rejects.toBeInstanceOf(
      SafeProposedError,
    );
    expect(mocks.propose).toHaveBeenCalledOnce();
  });
  it("reports a dismissed or unsupported passkey as itself, not as a dashboard handoff", async () => {
    const { result } = renderHook(() => useSafeWrite(), { wrapper });
    const unsupported = new SafePasskeyUnsupportedError(SAFE);
    mocks.propose.mockRejectedValueOnce(unsupported);
    await expect(result.current.write({ safe: SAFE, calls })).rejects.toBe(unsupported);
    const cancelled = new DOMException("cancelled", "NotAllowedError");
    mocks.propose.mockRejectedValueOnce(cancelled);
    await expect(result.current.write({ safe: SAFE, calls })).rejects.toBe(cancelled);
  });
  it("keeps the dashboard available when the transaction service is unavailable", async () => {
    mocks.propose.mockRejectedValue(new Error("Safe Transaction Service unavailable"));
    const { result } = renderHook(() => useSafeWrite(), { wrapper });
    await expect(result.current.write({ safe: SAFE, calls })).rejects.toMatchObject({
      safe: SAFE,
      message: "Safe Transaction Service unavailable",
    });
    await expect(result.current.write({ safe: SAFE, calls })).rejects.toBeInstanceOf(
      SafeDashboardRequiredError,
    );
  });
});
