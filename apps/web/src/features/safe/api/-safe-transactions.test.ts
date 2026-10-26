import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { computeSafeTxHash } from "@clc/core/features/safe/logic";

const mocks = vi.hoisted(() => ({
  nonce: vi.fn(),
  relayBatch: vi.fn(),
  waitRelay: vi.fn(),
}));
vi.mock("viem/actions", () => ({ readContract: mocks.nonce }));
vi.mock("#/features/webauthn/api/relay-calibur-batch", () => ({
  relayCaliburBatch: mocks.relayBatch,
}));
vi.mock("#/features/ownership/api/wait-for-ownership-relay", () => ({
  waitForOwnershipRelay: mocks.waitRelay,
}));
vi.mock("#/lib/chain", () => ({ CHAIN_ID: 100 }));
vi.mock("#/lib/safe-config", () => ({
  SAFE_MULTISEND_CALL_ONLY: ["0x40A2aCCbd92BCA938b02010E17A5b8929b49130D"],
}));
vi.mock("#/connectors/calibur-webauthn", () => ({
  CALIBUR_WEBAUTHN_CONNECTOR_ID: "calibur-webauthn",
}));

import { proposeSafeTransaction, SafePendingConflictError } from "./safe-transactions";

const SAFE = "0x1111111111111111111111111111111111111111";
const ASSET = "0x2222222222222222222222222222222222222222";
const ME = "0x3333333333333333333333333333333333333333";
const SIGNATURE = `0x${"11".repeat(64)}1b` as const;
const call = { to: ASSET, value: "0", data: "0xf2fde38b" } as const;

const sign = vi.fn();
const signer = {
  senderAddress: ME,
  connectorId: "private-key",
  includeAuthorization: false,
  sign,
} as const;

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    safe: SAFE,
    safeTxHash: `0x${"ab".repeat(32)}`,
    to: ASSET,
    value: "0",
    data: "0xf2fde38b",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce: "5",
    confirmations: [{ owner: ME, signature: SIGNATURE, submittedAt: "now" }],
    confirmationsRequired: 1,
    isExecuted: false,
    isSuccessful: null,
    transactionHash: null,
    ...overrides,
  } as never;
}

function safeClient(queued: unknown[] = []) {
  return {
    pending: vi.fn().mockResolvedValue(queued),
    propose: vi.fn().mockImplementation(async () => proposal()),
    confirm: vi.fn().mockImplementation(async () => proposal()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nonce.mockResolvedValue(5n);
  sign.mockResolvedValue(SIGNATURE);
});

describe("proposeSafeTransaction", () => {
  it("signs the hash of the transaction it proposes, at the Safe's current nonce", async () => {
    const client = safeClient();
    await proposeSafeTransaction(
      { chain: {} as never, safe: client as never },
      { safe: SAFE, signer, calls: [call] },
    );

    const sent = client.propose.mock.calls[0]![0];
    expect(sent.tx).toMatchObject({ to: ASSET, operation: 0, nonce: "5", gasPrice: "0" });
    expect(sent.safeTxHash).toBe(computeSafeTxHash(100, SAFE, sent.tx));
    expect(sent).toMatchObject({ safe: SAFE, sender: ME, signature: SIGNATURE });
    expect(sign.mock.calls[0]![0]).toMatchObject({
      domain: { chainId: 100, verifyingContract: SAFE },
    });
  });

  it("wraps a batch in the pinned MultiSendCallOnly", async () => {
    const client = safeClient();
    await proposeSafeTransaction(
      { chain: {} as never, safe: client as never },
      {
        safe: SAFE,
        signer,
        calls: [call, { ...call, to: SAFE.replace("1111", "4444") as `0x${string}` }],
      },
    );
    expect(client.propose.mock.calls[0]![0].tx).toMatchObject({
      to: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
      operation: 1,
    });
  });

  it("refuses to queue a second transaction at a nonce that already has one", async () => {
    const client = safeClient([proposal({ nonce: "5" })]);
    await expect(
      proposeSafeTransaction(
        { chain: {} as never, safe: client as never },
        { safe: SAFE, signer, calls: [call] },
      ),
    ).rejects.toBeInstanceOf(SafePendingConflictError);
    expect(sign).not.toHaveBeenCalled();
    expect(client.propose).not.toHaveBeenCalled();
  });

  it("ignores queued transactions at other nonces", async () => {
    const client = safeClient([proposal({ nonce: "6" })]);
    await proposeSafeTransaction(
      { chain: {} as never, safe: client as never },
      { safe: SAFE, signer, calls: [call] },
    );
    expect(client.propose).toHaveBeenCalledOnce();
  });

  it("refuses a passkey before prompting for anything", async () => {
    const client = safeClient();
    await expect(
      proposeSafeTransaction(
        { chain: {} as never, safe: client as never },
        { safe: SAFE, signer: { ...signer, connectorId: "calibur-webauthn" }, calls: [call] },
      ),
    ).rejects.toThrow(/multisig wallet/);
    expect(sign).not.toHaveBeenCalled();
  });
});
