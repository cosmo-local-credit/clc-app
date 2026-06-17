import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { CALIBUR } = vi.hoisted(() => ({
  CALIBUR: "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85" as `0x${string}`,
}));

vi.mock("#/lib/backend-config", () => ({
  CALIBUR_ADDRESS: CALIBUR,
}));

import { eip7702DelegationCode } from "@clc/core/features/webauthn";
import { waitForDelegation } from "./use-calibur-delegate-from-pk";

const ADDR = "0xabcdef1234567890abcdef1234567890abcdef12" as `0x${string}`;
const DELEGATION_CODE = eip7702DelegationCode(CALIBUR);

describe("waitForDelegation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when bytecode already matches on first poll", async () => {
    const getCode = vi.fn().mockResolvedValue(DELEGATION_CODE);
    const client = { getCode };

    const promise = waitForDelegation(ADDR, client, 5_000, 500);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(getCode).toHaveBeenCalledTimes(1);
  });

  it("resolves after code matches on a subsequent poll", async () => {
    const getCode = vi.fn().mockResolvedValueOnce("0xdeadbeef").mockResolvedValue(DELEGATION_CODE);
    const client = { getCode };

    const promise = waitForDelegation(ADDR, client, 5_000, 500);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(getCode).toHaveBeenCalledTimes(2);
  });

  it("throws on timeout when code never matches", async () => {
    const getCode = vi.fn().mockResolvedValue("0xdeadbeef");
    const client = { getCode };

    const promise = waitForDelegation(ADDR, client, 1_000, 500);
    void promise.catch(() => {}); // prevent unhandled rejection before assertion
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("not confirmed on-chain");
  });

  it("propagates getCode errors", async () => {
    const getCode = vi.fn().mockRejectedValue(new Error("RPC timeout"));
    const client = { getCode };

    const promise = waitForDelegation(ADDR, client, 5_000, 500);
    void promise.catch(() => {}); // prevent unhandled rejection before assertion
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("RPC timeout");
  });
});
