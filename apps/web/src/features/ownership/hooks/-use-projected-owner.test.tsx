import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), code: vi.fn() }));
vi.mock("#/lib/api/safe", () => ({ safeClient: { owner: mocks.owner } }));
vi.mock("#/lib/safe-config", () => ({ SAFE_OWNERSHIP_ENABLED: true }));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
vi.mock("./use-asset-owner", () => ({ useAssetOwner: (_asset: string, owner: string) => owner }));
vi.mock("wagmi", () => ({ useClient: () => ({}) }));
vi.mock("viem/actions", () => ({
  getCode: mocks.code,
  getBlockNumber: vi.fn(),
  readContract: vi.fn(),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    session: { address: "0x00000000000000000000000000000000000000a1" },
  }),
}));

import { useAssetOwnerInfo } from "./use-asset-owner-info";

describe("projected multisig permissions", () => {
  it("uses persisted owners for display and permissions without another chain dependency", async () => {
    const owner = "0x1111111111111111111111111111111111111111";
    mocks.owner.mockResolvedValue({
      kind: "safe",
      owner,
      signers: ["0x00000000000000000000000000000000000000a1"],
      threshold: null,
    });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAssetOwnerInfo("asset", owner), { wrapper });
    await waitFor(() => expect(result.current.isSafeOwned).toBe(true));
    expect(result.current.canManage).toBe(true);
    expect(result.current.info).toMatchObject({ threshold: null });
    expect(mocks.owner).toHaveBeenCalledWith(owner, expect.any(AbortSignal));
    expect(mocks.code).not.toHaveBeenCalled();
  });
});
