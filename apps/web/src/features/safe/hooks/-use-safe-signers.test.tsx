import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { decodeFunctionData, parseAbi } from "viem";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SAFE = "0x1111111111111111111111111111111111111111";
const [FIRST, SECOND, THIRD] = [
  "0x00000000000000000000000000000000000000c3",
  "0x00000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000b2",
] as const;

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), mine: vi.fn() }));
vi.mock("wagmi", () => ({ useClient: () => ({ chain: { id: 100 } }) }));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
vi.mock("#/lib/safe-config", () => ({ SAFE_OWNERSHIP_ENABLED: true }));
vi.mock("#/lib/api/safe", () => ({ safeClient: { mine: mocks.mine } }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: SECOND } }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  readAssetOwnerInfo: mocks.read,
}));
vi.mock("./use-safe-write", () => ({ useSafeWrite: () => ({ write: mocks.write }) }));

const { useMySafes, useProposeSignerChange, useSafeSigners } = await import("./use-safe-signers");

const ownerAbi = parseAbi([
  "function removeOwner(address,address,uint256)",
  "function addOwnerWithThreshold(address,uint256)",
]);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // getOwners order: newest first, not address order.
  mocks.read.mockResolvedValue({
    kind: "safe",
    owner: SAFE,
    signers: [FIRST, SECOND, THIRD],
    threshold: 2,
  });
  mocks.write.mockResolvedValue(undefined);
});

describe("useProposeSignerChange", () => {
  it("names the removed signer's predecessor as the Safe orders them at proposal time", async () => {
    const { result } = renderHook(() => useProposeSignerChange(SAFE), { wrapper });
    await act(() =>
      result.current.mutateAsync({ kind: "removeSigner", signer: THIRD, threshold: 1 }),
    );
    const [{ safe, calls }] = mocks.write.mock.calls[0]!;
    expect(safe).toBe(SAFE);
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(SAFE);
    const [prev, removed, threshold] = decodeFunctionData({ abi: ownerAbi, data: calls[0].data })
      .args as readonly [string, string, bigint];
    expect([prev.toLowerCase(), removed.toLowerCase(), threshold]).toEqual([SECOND, THIRD, 1n]);
  });

  it("reads the signers again rather than trusting an earlier read", async () => {
    const { result } = renderHook(() => useProposeSignerChange(SAFE), { wrapper });
    mocks.read.mockResolvedValueOnce({
      kind: "safe",
      owner: SAFE,
      signers: [THIRD, FIRST, SECOND],
      threshold: 2,
    });
    await act(() =>
      result.current.mutateAsync({ kind: "removeSigner", signer: THIRD, threshold: 1 }),
    );
    const data = mocks.write.mock.calls[0]![0].calls[0].data;
    expect(decodeFunctionData({ abi: ownerAbi, data }).args[0]).toBe(
      "0x0000000000000000000000000000000000000001",
    );
  });

  it("refuses a change the Safe would refuse without proposing it", async () => {
    const { result } = renderHook(() => useProposeSignerChange(SAFE), { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ kind: "addSigner", signer: FIRST, threshold: 2 })),
    ).rejects.toThrow("already-signer");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("refuses a multisig whose threshold cannot be read", async () => {
    mocks.read.mockResolvedValueOnce({
      kind: "safe",
      owner: SAFE,
      signers: [FIRST],
      threshold: null,
    });
    const { result } = renderHook(() => useProposeSignerChange(SAFE), { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ kind: "changeThreshold", threshold: 1 })),
    ).rejects.toThrow("could not be read");
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

describe("useSafeSigners", () => {
  it("reads only once the sheet asks for it", async () => {
    const { result, rerender } = renderHook(({ enabled }) => useSafeSigners(SAFE, enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    expect(mocks.read).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data?.owners).toEqual([FIRST, SECOND, THIRD]));
    expect(result.current.data?.threshold).toBe(2);
  });
});

describe("useMySafes", () => {
  it("lists the signed-in account's multisigs", async () => {
    const safes = [{ kind: "safe", owner: SAFE, signers: [FIRST, SECOND], threshold: 1 }];
    mocks.mine.mockResolvedValue(safes);
    const { result } = renderHook(() => useMySafes(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(safes));
  });
});
