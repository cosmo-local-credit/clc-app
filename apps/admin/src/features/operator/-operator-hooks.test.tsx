import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  relay: vi.fn(),
  wait: vi.fn(),
}));

vi.mock("#/features/auth/relay-batch", () => ({
  relayOperatorBatch: (...args: unknown[]) => state.relay(...args),
}));
vi.mock("#/lib/api", () => ({
  clcApi: { auth: { waitForTrackingCompletion: (...args: unknown[]) => state.wait(...args) } },
}));
vi.mock("#/lib/relayer-config", () => ({ relayerClient: { name: "relayer" } }));

import { useOperatorKeyStore } from "#/features/auth/operator-key";
import { sameAddress, useOperatorAddress } from "./operator-address";
import { useOperatorCalls } from "./use-operator-calls";

const ADDRESS = "0x1000000000000000000000000000000000000001" as const;
const CALL = { to: ADDRESS, value: "0", data: "0x" } as const;

beforeEach(() => {
  state.relay.mockReset().mockResolvedValue({ trackingId: "tracking-1" });
  state.wait.mockReset().mockResolvedValue({ txHash: "0xabc" });
  useOperatorKeyStore.setState({ key: null });
});

describe("operator hooks", () => {
  it("reads either operator-key representation and compares addresses case-insensitively", () => {
    const { result } = renderHook(() => useOperatorAddress());
    expect(result.current).toBeNull();

    act(() => {
      useOperatorKeyStore.setState({
        key: { kind: "privateKey", address: ADDRESS, privateKey: `0x${"11".repeat(32)}` },
      });
    });
    expect(result.current).toBe(ADDRESS);

    act(() => {
      useOperatorKeyStore.setState({
        key: {
          kind: "passkey",
          credential: {
            credentialId: "credential",
            keyHash: `0x${"22".repeat(32)}`,
            publicKeyX: "1",
            publicKeyY: "2",
            address: ADDRESS,
            stale: false,
          },
        },
      });
    });
    expect(result.current).toBe(ADDRESS);
    expect(sameAddress(ADDRESS, ADDRESS.toUpperCase())).toBe(true);
    expect(sameAddress(null, ADDRESS)).toBe(false);
  });

  it("relays a batch, waits for completion, and refreshes pool and admin state", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useOperatorCalls(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync([CALL])).resolves.toEqual({
        trackingId: "tracking-1",
        txHash: "0xabc",
      });
    });

    expect(state.relay).toHaveBeenCalledWith([CALL], { name: "relayer" });
    expect(state.wait).toHaveBeenCalledWith("tracking-1");
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
  });
});
