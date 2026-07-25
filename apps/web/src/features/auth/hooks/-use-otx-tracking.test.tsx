import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { RelayerError } from "#/features/webauthn/api/relayer-client";
import { useOtxTracking } from "./use-otx-tracking";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useOtxTracking", () => {
  it("treats a 404 (OTX row not yet written by the async worker) as pending, not an error", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new RelayerError("not_found", "tracking id not found", 404))
      .mockResolvedValue({
        otx: [
          {
            id: 1,
            trackingId: "tracking-1",
            otxType: "RELAY_DELEGATE_EXEC",
            txHash: "0xdeadbeef",
            nonce: 0,
            replaced: false,
            createdAt: "2026-06-18T00:00:00Z",
            status: "SUCCESS",
          },
        ],
      });

    const { result } = renderHook(() => useOtxTracking("tracking-1", { pollMs: 10, queryFn }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
    expect(result.current.outcome.kind).toBe("pending");

    await waitFor(() => expect(result.current.outcome.kind).toBe("success"));
  });

  it("surfaces a non-404 failure as a terminal error", async () => {
    const queryFn = vi.fn().mockRejectedValue(new RelayerError("server_error", "boom", 500));

    const { result } = renderHook(() => useOtxTracking("tracking-1", { pollMs: 10, queryFn }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.outcome.kind).toBe("error"));
  });
});
