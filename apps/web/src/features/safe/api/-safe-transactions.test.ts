import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { computeSafeTxHash } from "@clc/core/features/safe/logic";
import { caliburNestedPersonalSignDigest } from "@clc/core/features/webauthn/index";
import {
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  decodeAbiParameters,
  getAddress,
  hexToBigInt,
  size,
  slice,
} from "viem";
import { safeReadAbi } from "@clc/core/features/safe/logic";

const mocks = vi.hoisted(() => ({
  nonce: vi.fn(),
  passkeySign: vi.fn(),
  credential: vi.fn(),
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
vi.mock("#/features/webauthn/api/sign-digest", () => ({
  signDigestWithPasskey: mocks.passkeySign,
}));
vi.mock("#/lib/webauthn-storage", () => ({ getWebAuthnCredential: mocks.credential }));

import { proposeSafeTransaction, SafePendingConflictError } from "./safe-transactions";
import { readSafeVersion, SafePasskeyUnsupportedError } from "./sign-safe-transaction";

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

  describe("with a passkey", () => {
    const chain = { chain: { id: 100 } } as never;
    const passkeySigner = { ...signer, connectorId: "calibur-webauthn" } as const;
    const DOMAIN = `0x${"44".repeat(32)}` as const;
    const KEY_HASH = `0x${"55".repeat(32)}` as const;
    const AUTH = "0xa11ce0" as const;
    const reads = (version: string) =>
      mocks.nonce.mockImplementation(async (_client, { functionName }) => {
        if (functionName === "VERSION") return version;
        if (functionName === "domainSeparator") return DOMAIN;
        return 5n;
      });

    beforeEach(() => {
      mocks.credential.mockReturnValue({
        credentialId: "cred",
        keyHash: KEY_HASH,
        publicKeyX: "1",
        publicKeyY: "2",
        address: ME,
        stale: false,
      });
      mocks.passkeySign.mockResolvedValue(AUTH);
    });

    it("refuses a Safe before 1.5.0 without prompting", async () => {
      reads("1.4.1");
      const client = safeClient();
      await expect(
        proposeSafeTransaction(
          { chain, safe: client as never },
          { safe: SAFE, signer: passkeySigner, calls: [call] },
        ),
      ).rejects.toBeInstanceOf(SafePasskeyUnsupportedError);
      expect(mocks.passkeySign).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(client.propose).not.toHaveBeenCalled();
    });

    it("signs the nested digest as a Calibur contract signature on Safe 1.5.0", async () => {
      reads("1.5.0");
      const client = safeClient();
      await proposeSafeTransaction(
        { chain, safe: client as never },
        { safe: SAFE, signer: passkeySigner, calls: [call] },
      );
      const sent = client.propose.mock.calls[0]![0];
      expect(sent.sender).toBe(ME);
      expect(mocks.passkeySign).toHaveBeenCalledWith(
        caliburNestedPersonalSignDigest(DOMAIN, sent.safeTxHash),
        "cred",
      );
      expect(sign).not.toHaveBeenCalled();
      // r = owner, s = 65, v = 0, then the length-prefixed Calibur payload.
      const signature = sent.signature as `0x${string}`;
      expect(getAddress(slice(signature, 12, 32))).toBe(getAddress(ME));
      expect(hexToBigInt(slice(signature, 32, 64))).toBe(65n);
      expect(slice(signature, 64, 65)).toBe("0x00");
      const payload = slice(signature, 97);
      expect(hexToBigInt(slice(signature, 65, 97))).toBe(BigInt(size(payload)));
      expect(
        decodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }, { type: "bytes" }], payload),
      ).toEqual([KEY_HASH, AUTH, "0x"]);
    });

    it("refuses a stored passkey of another wallet", async () => {
      reads("1.5.0");
      mocks.credential.mockReturnValue({
        credentialId: "cred",
        keyHash: KEY_HASH,
        publicKeyX: "1",
        publicKeyY: "2",
        address: SAFE,
        stale: false,
      });
      await expect(
        proposeSafeTransaction(
          { chain, safe: safeClient() as never },
          { safe: SAFE, signer: passkeySigner, calls: [call] },
        ),
      ).rejects.toThrow(/does not match/);
      expect(mocks.passkeySign).not.toHaveBeenCalled();
    });
  });

  it("signs a paper wallet's SafeTx without reading the Safe version", async () => {
    mocks.nonce.mockResolvedValue(5n);
    await proposeSafeTransaction(
      { chain: {} as never, safe: safeClient() as never },
      { safe: SAFE, signer, calls: [call] },
    );
    expect(sign).toHaveBeenCalledOnce();
    expect(mocks.nonce.mock.calls.map(([, args]) => args.functionName)).toEqual(["nonce"]);
  });
});

describe("readSafeVersion", () => {
  it("reads no version from a Safe-compatible contract without one", async () => {
    mocks.nonce.mockRejectedValueOnce(
      new ContractFunctionZeroDataError({ functionName: "VERSION" }),
    );
    await expect(readSafeVersion({} as never, SAFE)).resolves.toBeUndefined();
    mocks.nonce.mockRejectedValueOnce(
      new ContractFunctionRevertedError({ abi: safeReadAbi, functionName: "VERSION" }),
    );
    await expect(readSafeVersion({} as never, SAFE)).resolves.toBeUndefined();
  });

  it("throws a transport failure rather than reading it as no version", async () => {
    mocks.nonce.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(readSafeVersion({} as never, SAFE)).rejects.toThrow("fetch failed");
  });
});
