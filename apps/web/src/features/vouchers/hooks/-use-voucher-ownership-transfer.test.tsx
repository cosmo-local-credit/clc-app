import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const NEW_OWNER = "0x3333333333333333333333333333333333333333" as const;
const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  track: vi.fn(),
  read: vi.fn(),
  catalog: vi.fn(),
  address: "0x1111111111111111111111111111111111111111",
  delegation: "not-delegated",
}));
vi.mock("#/features/webauthn/api/relay-calibur-batch", () => ({ relayCaliburBatch: mocks.relay }));
vi.mock("wagmi", () => ({
  useClient: () => ({ chain: { id: 100 } }),
  useConnection: () => ({ address: mocks.address, connector: { id: "private-key" } }),
}));
vi.mock("viem/actions", () => ({
  readContract: mocks.read,
  getBlockNumber: async () => 42n,
  getTransactionReceipt: async () => ({ blockNumber: 42n }),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, session: { address: mocks.address } }),
}));
vi.mock("#/features/webauthn/hooks/use-calibur-delegation", () => ({
  useCaliburDelegation: () => mocks.delegation,
}));
vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ trackRelay: mocks.track }),
}));
vi.mock("#/lib/api/market", () => ({ marketClient: { getMarketVoucher: mocks.catalog } }));
import {
  useOwnershipSubmissions,
  ownershipKey,
} from "#/features/ownership/state/ownership-submissions";
import { useVoucherOwnershipTransfer } from "./use-voucher-ownership-transfer";

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
  localStorage.clear();
  useOwnershipSubmissions.setState({ submissions: {} });
  mocks.address = OWNER;
  mocks.delegation = "not-delegated";
  mocks.relay.mockResolvedValue({ trackingId: "ownership-1" });
  mocks.track.mockResolvedValue({ result: { otx: [{ status: "SUCCESS", txHash: "0xabc" }] } });
  mocks.read.mockResolvedValueOnce(OWNER).mockResolvedValue(NEW_OWNER);
  mocks.catalog.mockResolvedValue({ address: TOKEN, ownerAddress: NEW_OWNER });
});
afterEach(() => vi.useRealTimers());
const input = { tokenAddress: TOKEN, ownerAddress: OWNER, newOwnerAddress: NEW_OWNER };
describe("voucher ownership settlement", () => {
  it("signs once through the connector, waits for settlement and refreshes the catalog", async () => {
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      expect(await result.current.mutateAsync(input)).toMatchObject({ catalogSynced: true });
    });
    expect(mocks.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: OWNER,
        connectorId: "private-key",
        includeAuthorization: true,
        calls: [expect.objectContaining({ to: TOKEN })],
      }),
      expect.anything(),
    );
    expect(mocks.track).toHaveBeenCalledWith("ownership-1");
    expect(mocks.catalog).toHaveBeenCalled();
  });
  it("retains an uncertain submission across remount and checks it without another signature", async () => {
    mocks.track.mockRejectedValue(new Error("network unavailable"));
    const first = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      await expect(first.result.current.mutateAsync(input)).rejects.toThrow(/ownership-1/);
    });
    expect(useOwnershipSubmissions.getState().submissions[ownershipKey(TOKEN)]?.confirmed).toBe(
      false,
    );
    first.unmount();
    mocks.track.mockResolvedValue({ result: { otx: [{ status: "SUCCESS", txHash: "0xabc" }] } });
    const second = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      await second.result.current.mutateAsync(input);
    });
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });
  it("reports catalog lag as confirmed ownership and retains authority across reloads", async () => {
    vi.useFakeTimers();
    mocks.catalog.mockResolvedValue({ address: TOKEN, ownerAddress: OWNER });
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    let transfer!: ReturnType<typeof result.current.mutateAsync>;
    await act(async () => {
      transfer = result.current.mutateAsync(input);
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(await transfer).toMatchObject({ catalogSynced: false });
    expect(useOwnershipSubmissions.getState().submissions[ownershipKey(TOKEN)]?.confirmed).toBe(
      true,
    );
    expect(localStorage.getItem("clc.ownership-submissions")).toContain("ownership-1");
    expect(mocks.relay).toHaveBeenCalledTimes(1);
  });
  it("does not sign for an address other than the authenticated owner", async () => {
    mocks.address = NEW_OWNER;
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toThrow(/current owner wallet/);
    });
    expect(mocks.relay).not.toHaveBeenCalled();
  });
  it("clears a definitively reverted submission", async () => {
    mocks.track.mockResolvedValue({ result: { otx: [{ status: "REVERTED" }] } });
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toThrow(/failed on-chain/);
    });
    expect(useOwnershipSubmissions.getState().submissions[ownershipKey(TOKEN)]).toBeUndefined();
  });
  it("does not submit when current on-chain authority differs", async () => {
    mocks.read.mockReset().mockResolvedValue(NEW_OWNER);
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toThrow(/on-chain owner/);
    });
    expect(mocks.relay).not.toHaveBeenCalled();
  });
  it("keeps cancellation retryable and never records an unsubmitted transfer", async () => {
    mocks.relay.mockRejectedValue(new Error("User cancelled"));
    const { result } = renderHook(() => useVoucherOwnershipTransfer(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toThrow(/cancelled/);
    });
    expect(useOwnershipSubmissions.getState().submissions[ownershipKey(TOKEN)]).toBeUndefined();
  });
});
