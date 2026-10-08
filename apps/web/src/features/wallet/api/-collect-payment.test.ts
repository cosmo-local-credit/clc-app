import {
  RelayerError,
  type RelayerClient,
  type RelayPayload,
} from "@clc/api/features/relayer/client";
import type { CollectIntent } from "@clc/core/features/nfc/collect";
import { decodeFunctionData, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  COLLECT_DEADLINE_SECONDS,
  type CollectPaymentDeps,
  prepareCollectPayment,
  reconcileCollectRequest,
  submitCollectRequest,
} from "./collect-payment";

const PAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const PAYER = privateKeyToAccount(PAYER_KEY).address;
const COLLECTOR = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x4444444444444444444444444444444444444444" as const;
const RELAYER = "0x9999999999999999999999999999999999999999" as const;
const NOW = 1_800_000_000_000;

const intent: CollectIntent = {
  id: "5f0e8c1a-8f7e-4a39-9a43-0c3c3b0f0d11",
  collector: COLLECTOR,
  token: { address: TOKEN, symbol: "SRF", decimals: 6 },
  amountRaw: "2500000",
  amountLabel: "2.5",
};

function relayer(overrides: Partial<RelayerClient> = {}): RelayerClient {
  return {
    getHealth: vi.fn(),
    getEOANonce: vi.fn().mockResolvedValue({ result: { nonce: "0" } }),
    getCaliburNonce: vi.fn(),
    trackRelay: vi.fn(),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi
      .fn()
      .mockResolvedValue({ result: { nonce: "3", digest: `0x${"11".repeat(32)}` } }),
    relay: vi.fn().mockResolvedValue({ result: { trackingId: "track-1" } }),
    ...overrides,
  };
}

function deps(overrides: Partial<CollectPaymentDeps> = {}): CollectPaymentDeps {
  return {
    relayer: relayer(),
    health: { chainId: 100, relayerAddress: RELAYER, idempotentRelay: true },
    chainId: 100,
    readBalance: vi.fn().mockResolvedValue(10_000_000n),
    readDelegated: vi.fn().mockResolvedValue(true),
    now: () => NOW,
    ...overrides,
  };
}

describe("prepareCollectPayment", () => {
  it("signs one transfer to the collector from the payer's own wallet", async () => {
    const d = deps();
    const prepared = await prepareCollectPayment(intent, PAYER_KEY, d);
    expect(prepared.kind).toBe("signed");
    if (prepared.kind !== "signed") return;

    const { request } = prepared;
    expect(request.operationId).toBe(intent.id);
    expect(request.userAddress).toBe(PAYER);
    expect(request.signatureType).toBe("secp256k1");
    const [call] = request.signedBatch.batchedCall.calls;
    expect(call?.to).toBe(TOKEN);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call?.data as `0x${string}` });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args).toEqual([COLLECTOR, 2_500_000n]);
    // Balance is read for the payer explicitly, not the connected collector.
    expect(d.readBalance).toHaveBeenCalledWith(TOKEN, PAYER);
  });

  it("bounds the signature with a deadline instead of signing an open-ended payment", async () => {
    const d = deps();
    const prepared = await prepareCollectPayment(intent, PAYER_KEY, d);
    if (prepared.kind !== "signed") throw new Error("expected a signature");
    const deadline = Number(prepared.request.signedBatch.deadline);
    expect(deadline).toBe(Math.floor(NOW / 1000) + COLLECT_DEADLINE_SECONDS);
    expect(prepared.expiresAt).toBeGreaterThan(deadline * 1000);
    expect(d.relayer.relayPreview).toHaveBeenCalledWith(
      expect.objectContaining({ executor: RELAYER, deadline: String(deadline) }),
    );
  });

  it("attaches the EIP-7702 authorization for a wallet never used before", async () => {
    const d = deps({ readDelegated: vi.fn().mockResolvedValue(false) });
    const prepared = await prepareCollectPayment(intent, PAYER_KEY, d);
    if (prepared.kind !== "signed") throw new Error("expected a signature");
    expect(prepared.request.authorization).toMatchObject({ chainId: "100", nonce: "0" });
    expect(d.relayer.getEOANonce).toHaveBeenCalledWith(PAYER);
  });

  it("leaves the authorization off an already delegated wallet", async () => {
    const prepared = await prepareCollectPayment(intent, PAYER_KEY, deps());
    if (prepared.kind !== "signed") throw new Error("expected a signature");
    expect(prepared.request.authorization).toBeUndefined();
  });

  it("refuses an insufficient balance before previewing anything", async () => {
    const d = deps({ readBalance: vi.fn().mockResolvedValue(2_499_999n) });
    expect(await prepareCollectPayment(intent, PAYER_KEY, d)).toEqual({
      kind: "rejected",
      reason: "insufficient-balance",
    });
    expect(d.relayer.relayPreview).not.toHaveBeenCalled();
  });

  it("refuses the collector's own card", async () => {
    const own = { ...intent, collector: PAYER };
    expect(await prepareCollectPayment(own, PAYER_KEY, deps())).toEqual({
      kind: "rejected",
      reason: "self-payment",
    });
  });

  it("refuses a relayer on another chain", async () => {
    const d = deps({ health: { chainId: 42220, relayerAddress: RELAYER } });
    expect(await prepareCollectPayment(intent, PAYER_KEY, d)).toEqual({
      kind: "rejected",
      reason: "chain-mismatch",
    });
  });
});

const REQUEST = { operationId: intent.id, userAddress: PAYER } as unknown as RelayPayload;

describe("submitCollectRequest", () => {
  it("separates an accepted, a refused and an unanswered submission", async () => {
    expect(await submitCollectRequest(REQUEST, relayer())).toEqual({
      kind: "submitted",
      trackingId: "track-1",
    });
    const refused = relayer({
      relay: vi.fn().mockRejectedValue(new RelayerError("server_error", "bad nonce", 400)),
    });
    expect(await submitCollectRequest(REQUEST, refused)).toEqual({
      kind: "rejected",
      detail: "bad nonce",
      conflict: false,
    });
    const lost = relayer({ relay: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    expect(await submitCollectRequest(REQUEST, lost)).toEqual({ kind: "uncertain" });
  });
});

describe("reconcileCollectRequest", () => {
  const sleep = vi.fn(async () => {});

  it("resends the identical signed request until the relay answers, never signing again", async () => {
    const relay = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new RelayerError("server_error", "gateway", 502))
      .mockResolvedValueOnce({ result: { trackingId: "original" } });
    const client = relayer({ relay });
    const result = await reconcileCollectRequest(REQUEST, NOW + 60_000, {
      relayer: client,
      now: () => NOW,
      sleep,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ kind: "submitted", trackingId: "original" });
    expect(relay).toHaveBeenCalledTimes(3);
    for (const [payload] of relay.mock.calls) expect(payload).toBe(REQUEST);
    expect(client.relayPreview).not.toHaveBeenCalled();
  });

  it("calls a reused operation id unknown, not refused", async () => {
    const client = relayer({
      relay: vi.fn().mockRejectedValue(new RelayerError("conflict", "different request", 409)),
    });
    expect(
      await reconcileCollectRequest(REQUEST, NOW + 60_000, {
        relayer: client,
        now: () => NOW,
        sleep,
        signal: new AbortController().signal,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("reports a definite refusal as nothing charged", async () => {
    const client = relayer({
      relay: vi
        .fn()
        .mockRejectedValue(new RelayerError("verification_failed", "bad signature", 401)),
    });
    expect(
      await reconcileCollectRequest(REQUEST, NOW + 60_000, {
        relayer: client,
        now: () => NOW,
        sleep,
        signal: new AbortController().signal,
      }),
    ).toEqual({ kind: "rejected", detail: "bad signature" });
  });

  it("stops at the deadline without an answer", async () => {
    let now = NOW;
    const client = relayer({ relay: vi.fn().mockRejectedValue(new TypeError("offline")) });
    const result = await reconcileCollectRequest(REQUEST, NOW + 10_000, {
      relayer: client,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ kind: "unknown" });
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const client = relayer({
      relay: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new TypeError("offline");
      }),
    });
    expect(
      await reconcileCollectRequest(REQUEST, NOW + 60_000, {
        relayer: client,
        now: () => NOW,
        sleep,
        signal: controller.signal,
      }),
    ).toEqual({ kind: "aborted" });
  });
});
