import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const OTHER_TOKEN = "0x3333333333333333333333333333333333333333" as const;

const mocks = vi.hoisted(() => ({ relay: vi.fn() }));
vi.mock("#/features/webauthn/api/relay-calibur-batch", () => ({ relayCaliburBatch: mocks.relay }));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () => ({ info: undefined, isSafeOwned: false, isSafeSigner: false }),
}));
vi.mock("#/features/safe/hooks/use-safe-write", () => ({
  useSafeWrite: () => ({ write: vi.fn() }),
}));
vi.mock("wagmi", () => ({
  useClient: () => undefined,
  useConnection: () => ({ address: OWNER, connector: { id: "private-key" } }),
}));

import { useVoucherBurn } from "./use-voucher-burn";
import { useVoucherMint } from "./use-voucher-mint";

function deferred() {
  let resolve!: (value: { trackingId: string }) => void;
  const promise = new Promise<{ trackingId: string }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient();
  mocks.relay.mockReset();
});

describe("an owner action started in one view", () => {
  it("keeps a burn in flight for a view mounted after the first one unmounts", async () => {
    const relay = deferred();
    mocks.relay.mockReturnValue(relay.promise);
    const first = renderHook(() => useVoucherBurn(TOKEN), { wrapper });
    act(() => {
      void first.result.current.mutateAsync({
        tokenAddress: TOKEN,
        ownerAddress: OWNER,
        amountRaw: "100",
      });
    });
    await waitFor(() => expect(first.result.current.inFlight).toBe(true));
    first.unmount();

    const second = renderHook(() => useVoucherBurn(TOKEN), { wrapper });
    const otherVoucher = renderHook(() => useVoucherBurn(OTHER_TOKEN), { wrapper });
    expect(second.result.current.isPending).toBe(false);
    expect(second.result.current.inFlight).toBe(true);
    expect(otherVoucher.result.current.inFlight).toBe(false);

    await act(async () => relay.resolve({ trackingId: "burn-1" }));
    await waitFor(() => expect(second.result.current.inFlight).toBe(false));
  });

  it("keeps a mint in flight for a view mounted after the first one unmounts", async () => {
    const relay = deferred();
    mocks.relay.mockReturnValue(relay.promise);
    const asset = { address: TOKEN, ownerAddress: OWNER };
    const first = renderHook(() => useVoucherMint(asset), { wrapper });
    act(() => {
      void first.result.current.mutateAsync({
        tokenAddress: TOKEN,
        ownerAddress: OWNER,
        amountRaw: "100",
      });
    });
    await waitFor(() => expect(first.result.current.inFlight).toBe(true));
    first.unmount();

    const second = renderHook(() => useVoucherMint(asset), { wrapper });
    // A burn on the same voucher is a different action.
    const burn = renderHook(() => useVoucherBurn(TOKEN), { wrapper });
    expect(second.result.current.inFlight).toBe(true);
    expect(burn.result.current.inFlight).toBe(false);

    await act(async () => relay.resolve({ trackingId: "mint-1" }));
    await waitFor(() => expect(second.result.current.inFlight).toBe(false));
  });
});
