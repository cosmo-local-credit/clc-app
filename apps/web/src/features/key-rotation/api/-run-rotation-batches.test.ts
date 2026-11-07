import type { RelayerClient } from "@clc/api/features/relayer/client";
import { RelayerError } from "@clc/api/features/relayer/client";
import type { RotationBatch } from "@clc/core/features/key-rotation/logic";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { readCaliburDelegation } = vi.hoisted(() => ({ readCaliburDelegation: vi.fn() }));
vi.mock("#/features/webauthn/api/calibur-delegation", () => ({ readCaliburDelegation }));

import { runRotationBatches } from "./run-rotation-batches";

const RELAYER = "0x1234567890123456789012345678901234567890" as const;
const OLD_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const OLD = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const DIGEST = `0x${"11".repeat(32)}` as const;

function batch(seed: number): RotationBatch {
  const to = `0x${seed.toString(16).padStart(40, "0")}` as `0x${string}`;
  const call = { to, value: "0", data: "0x01" as const };
  return { groups: [{ kind: "voucher", address: to, calls: [call] }], calls: [call] };
}

function settled(status: string) {
  return {
    ok: true,
    result: {
      otx: [
        {
          id: 1,
          trackingId: "t",
          otxType: "RELAY",
          txHash: "0xabc",
          nonce: 1,
          replaced: false,
          createdAt: "",
          status,
        },
      ],
    },
  };
}

function relayer(): RelayerClient {
  return {
    getHealth: vi.fn().mockResolvedValue({ result: { chainId: 100, relayerAddress: RELAYER } }),
    getEOANonce: vi.fn().mockResolvedValue({ result: { nonce: "0" } }),
    getCaliburNonce: vi.fn(),
    trackRelay: vi.fn().mockResolvedValue(settled("SUCCESS")),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi.fn().mockResolvedValue({ result: { nonce: "1", digest: DIGEST } }),
    relay: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  } as unknown as RelayerClient;
}

afterEach(() => {
  vi.restoreAllMocks();
  readCaliburDelegation.mockReset();
});

describe("runRotationBatches", () => {
  it("signs each batch as the old card, in order, delegating only the first", async () => {
    readCaliburDelegation.mockResolvedValue(false);
    const client = relayer();

    const result = await runRotationBatches({
      batches: [batch(1), batch(2)],
      from: OLD,
      signer: { kind: "card", key: OLD_KEY },
      relayer: client,
    });

    expect(result).toEqual({ moved: [0, 1], failed: [], uncertainTrackingId: null });
    const relays = vi.mocked(client.relay).mock.calls.map(([payload]) => payload);
    expect(relays).toHaveLength(2);
    expect(relays.every((payload) => payload.userAddress === OLD)).toBe(true);
    expect(relays[0]?.authorization).toBeDefined();
    expect(relays[1]?.authorization).toBeUndefined();
    expect(relays.every((payload) => typeof payload.operationId === "string")).toBe(true);
  });

  it("resends a lost response as the identical request, never signing again", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    vi.mocked(client.relay)
      .mockRejectedValueOnce(new RelayerError("server_error", "bad gateway", 502))
      .mockResolvedValueOnce({ ok: true, result: { trackingId: "tracking-1" } });

    const result = await runRotationBatches({
      batches: [batch(1)],
      from: OLD,
      signer: { kind: "card", key: OLD_KEY },
      relayer: client,
    });

    expect(result.moved).toEqual([0]);
    expect(client.relayPreview).toHaveBeenCalledTimes(1);
    const [first, second] = vi.mocked(client.relay).mock.calls.map(([payload]) => payload);
    expect(second).toEqual(first);
  });

  it("carries the authorization again when the batch that held it never landed", async () => {
    readCaliburDelegation.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const client = relayer();
    vi.mocked(client.trackRelay).mockResolvedValueOnce(settled("REVERTED") as never);

    await runRotationBatches({
      batches: [batch(1), batch(2)],
      from: OLD,
      signer: { kind: "card", key: OLD_KEY },
      relayer: client,
    });

    const relays = vi.mocked(client.relay).mock.calls.map(([payload]) => payload);
    expect(relays[0]?.authorization).toBeDefined();
    expect(relays[1]?.authorization).toBeDefined();
  });

  it("does not repeat the authorization once the chain shows the wallet delegated", async () => {
    readCaliburDelegation.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const client = relayer();
    vi.mocked(client.trackRelay).mockResolvedValueOnce(settled("REVERTED") as never);

    await runRotationBatches({
      batches: [batch(1), batch(2)],
      from: OLD,
      signer: { kind: "card", key: OLD_KEY },
      relayer: client,
    });

    const relays = vi.mocked(client.relay).mock.calls.map(([payload]) => payload);
    expect(relays[0]?.authorization).toBeDefined();
    expect(relays[1]?.authorization).toBeUndefined();
  });

  it("keeps going past a reverted batch", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    vi.mocked(client.trackRelay).mockResolvedValueOnce(settled("REVERTED") as never);

    const reverted = await runRotationBatches({
      batches: [batch(1), batch(2)],
      from: OLD,
      signer: { kind: "card", key: OLD_KEY },
      relayer: client,
    });
    expect(reverted).toEqual({ moved: [1], failed: [0], uncertainTrackingId: null });
  });
});
