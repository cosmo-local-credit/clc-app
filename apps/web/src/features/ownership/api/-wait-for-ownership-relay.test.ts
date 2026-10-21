import type { RelayerClient } from "@clc/api/features/relayer/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { OwnershipSettlementError, waitForOwnershipRelay } from "./wait-for-ownership-relay";
afterEach(() => vi.useRealTimers());
describe("ownership relay tracking", () => {
  it("retains the ID when tracking times out", async () => {
    vi.useFakeTimers();
    const client = {
      trackRelay: vi.fn().mockResolvedValue({ result: { otx: [] } }),
    } as unknown as RelayerClient;
    const waiting = waitForOwnershipRelay(client, "timeout-1");
    const assertion = expect(waiting).rejects.toMatchObject({
      trackingId: "timeout-1",
      terminal: false,
    });
    await vi.advanceTimersByTimeAsync(300_000);
    await assertion;
  });
  it("distinguishes a terminal chain failure from an uncertain tracker error", async () => {
    const client = {
      trackRelay: vi.fn().mockResolvedValue({ result: { otx: [{ status: "REVERTED" }] } }),
    } as unknown as RelayerClient;
    await expect(waitForOwnershipRelay(client, "revert-1")).rejects.toMatchObject({
      trackingId: "revert-1",
      terminal: true,
    });
    vi.mocked(client.trackRelay).mockRejectedValue(new Error("Offline"));
    await expect(waitForOwnershipRelay(client, "offline-1")).rejects.toBeInstanceOf(
      OwnershipSettlementError,
    );
    await expect(waitForOwnershipRelay(client, "offline-1")).rejects.toMatchObject({
      terminal: false,
    });
  });
});
