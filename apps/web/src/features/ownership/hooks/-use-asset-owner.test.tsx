import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ block: vi.fn(), receipt: vi.fn(), read: vi.fn() }));
vi.mock("viem/actions", () => ({
  getBlockNumber: mocks.block,
  getTransactionReceipt: mocks.receipt,
  readContract: mocks.read,
}));
vi.mock("wagmi", () => ({ useClient: () => ({ chain: { id: 100 } }) }));
import { useAssetOwner } from "./use-asset-owner";
import { useOwnershipSubmissions } from "../state/ownership-submissions";
const A = "0x1111111111111111111111111111111111111111",
  FROM = "0x2222222222222222222222222222222222222222",
  TO = "0x3333333333333333333333333333333333333333";
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  useOwnershipSubmissions.setState({ submissions: {} });
  mocks.receipt.mockResolvedValue({ blockNumber: 42n });
  mocks.block.mockResolvedValue(42n);
  mocks.read.mockResolvedValue(TO);
});
describe("confirmed owner authority", () => {
  it("immediately removes sender authority during catalog lag and refreshes current ownership", async () => {
    const { result } = renderHook(() => useAssetOwner(A, FROM), { wrapper });
    expect(result.current).toBe(FROM);
    act(() =>
      useOwnershipSubmissions.getState().save(A, {
        trackingId: "t1",
        ownerAddress: FROM,
        newOwnerAddress: TO,
        confirmed: true,
        txHash: "0xabc",
      }),
    );
    expect(result.current).toBe(TO);
    await waitFor(() =>
      expect(mocks.read).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ blockNumber: 42n }),
      ),
    );
  });
  it("cannot restore the sender from a lagging RPC head or stale catalog", async () => {
    mocks.block.mockResolvedValue(41n);
    mocks.read.mockResolvedValue(FROM);
    useOwnershipSubmissions.getState().save(A, {
      trackingId: "t1",
      ownerAddress: FROM,
      newOwnerAddress: TO,
      confirmed: true,
      txHash: "0xabc",
    });
    const { result } = renderHook(() => useAssetOwner(A, FROM), { wrapper });
    await waitFor(() => expect(mocks.block).toHaveBeenCalled());
    expect(result.current).toBe(TO);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
