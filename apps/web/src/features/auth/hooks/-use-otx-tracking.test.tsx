import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { OtxTrackingOutcome, OtxTrackResult } from "@clc/api/features/auth/client";
import { TRACKING_UNCONFIRMED } from "@clc/api/features/auth/client";
import { BackendApiError } from "@clc/api/client/errors";
import { RelayerError } from "@clc/api/features/relayer/client";
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

  it("uses a flow-specific outcome selector for multi-transaction tracking", async () => {
    const earlySuccess = {
      id: 1,
      trackingId: "tracking-1",
      otxType: "POOL_TOKEN_INDEX_DEPLOY",
      txHash: "0xearly",
      nonce: 0,
      replaced: false,
      createdAt: "2026-06-18T00:00:00Z",
      status: "SUCCESS",
    };
    const poolSuccess = { ...earlySuccess, id: 2, otxType: "POOL_PROXY_DEPLOY", txHash: "0xpool" };
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ otx: [earlySuccess] })
      .mockResolvedValue({ otx: [earlySuccess, poolSuccess] });
    const getOutcome = vi.fn((result: OtxTrackResult | undefined): OtxTrackingOutcome => {
      const terminal = result?.otx.find((record) => record.otxType === "POOL_PROXY_DEPLOY");
      return terminal ? { kind: "success", otx: terminal } : { kind: "pending" };
    });

    const { result } = renderHook(
      () => useOtxTracking("tracking-1", { pollMs: 10, queryFn, getOutcome }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    expect(result.current.outcome).toEqual({ kind: "success", otx: poolSuccess });
    expect(getOutcome).toHaveBeenCalled();
  });

  it("surfaces a non-404 failure as a terminal error", async () => {
    const queryFn = vi.fn().mockRejectedValue(new RelayerError("server_error", "boom", 500));

    const { result } = renderHook(() => useOtxTracking("tracking-1", { pollMs: 10, queryFn }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.outcome.kind).toBe("error"));
  });

  it("keeps a persistent relayer 404 pending instead of surfacing it as an error", async () => {
    // The calibur flows poll the relayer, whose 404 is its own RelayerError, not a
    // BackendApiError. Matching only the backend's error type would turn a row
    // that has not been written yet into a failed delegation.
    const queryFn = vi
      .fn()
      .mockRejectedValue(new RelayerError("not_found", "tracking id not found", 404));

    const { result } = renderHook(() => useOtxTracking("tracking-1", { pollMs: 10, queryFn }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(queryFn).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.outcome).toEqual({ kind: "pending" });
  });

  it("keeps a persistent backend 404 pending, via the error taxonomy", async () => {
    const queryFn = vi.fn().mockRejectedValue(new BackendApiError(404, "not written yet"));

    const { result } = renderHook(() => useOtxTracking("tracking-2", { pollMs: 10, queryFn }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.outcome).toEqual({ kind: "pending" });
  });

  it("gives up on a tracking id that never appears, rather than polling for good", async () => {
    // A discarded job writes no OTX row ever, so this 404 never clears. Without
    // a deadline the caller shows a spinner behind a job that already failed.
    const queryFn = vi
      .fn()
      .mockRejectedValue(new RelayerError("not_found", "tracking id not found", 404));

    const { result } = renderHook(
      () => useOtxTracking("tracking-gone", { pollMs: 10, notFoundTimeoutMs: 40, queryFn }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.outcome.kind).toBe("pending"));
    await waitFor(() =>
      expect(result.current.outcome).toEqual({
        kind: "error",
        error: TRACKING_UNCONFIRMED,
      }),
    );

    // The deadline also stops the polling it was waiting on.
    const settled = queryFn.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(queryFn.mock.calls.length).toBe(settled);
  });

  it("waits out a slow worker that writes the row inside the deadline", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new RelayerError("not_found", "tracking id not found", 404))
      .mockResolvedValue({
        otx: [
          {
            id: 1,
            trackingId: "tracking-slow",
            otxType: "RELAY_DELEGATE_EXEC",
            txHash: "0xdeadbeef",
            nonce: 0,
            replaced: false,
            createdAt: "2026-06-18T00:00:00Z",
            status: "SUCCESS",
          },
        ],
      });

    const { result } = renderHook(
      () => useOtxTracking("tracking-slow", { pollMs: 10, notFoundTimeoutMs: 10_000, queryFn }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.outcome.kind).toBe("success"));
  });

  it("keeps waiting on a pending transaction once its row exists", async () => {
    // The deadline is for an id that never appears. A row that is on-chain and
    // unconfirmed is waited on for as long as the chain takes.
    const queryFn = vi.fn().mockResolvedValue({
      otx: [
        {
          id: 1,
          trackingId: "tracking-pending",
          otxType: "RELAY_DELEGATE_EXEC",
          txHash: "0xdeadbeef",
          nonce: 0,
          replaced: false,
          createdAt: "2026-06-18T00:00:00Z",
          status: "IN_NETWORK",
        },
      ],
    });

    const { result } = renderHook(
      () => useOtxTracking("tracking-pending", { pollMs: 10, notFoundTimeoutMs: 20, queryFn }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(queryFn).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(result.current.outcome).toEqual({ kind: "pending" });
  });

  it("reports the backend's own reason when it knows the job failed", async () => {
    // clc-core answers 410 with the discarded job's error, which is not a 404
    // and so is terminal on arrival — no deadline needed.
    const queryFn = vi
      .fn()
      .mockRejectedValue(
        new RelayerError("server_error", "delegate: authorization contract 0xaaa != 0xbbb", 410),
      );

    const { result } = renderHook(() => useOtxTracking("tracking-410", { pollMs: 10, queryFn }), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(result.current.outcome).toEqual({
        kind: "error",
        error: "delegate: authorization contract 0xaaa != 0xbbb",
      }),
    );
  });
});
