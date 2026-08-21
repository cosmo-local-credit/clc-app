import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { decodeAbiParameters, hexToBytes, keccak256, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useOperatorKeyStore } from "./operator-key";
import { relayOperatorBatch } from "./relay-batch";

const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const OPERATOR_KEY_STORAGE_KEY = "clc.admin.operator-key";
const RELAYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const DIGEST = keccak256("0xdeadbeef");
const CREDENTIAL_ID = "Y3JlZC1pZA";

const CALLS: CaliburCall[] = [
  { to: "0x61a8000000000000000000000000000000007001", value: "0", data: "0xabcdef" },
];

function relayerDouble() {
  return {
    getHealth: vi.fn().mockResolvedValue({ ok: true, result: { relayerAddress: RELAYER } }),
    getEOANonce: vi.fn().mockResolvedValue({ ok: true, result: { nonce: "3" } }),
    relayPreview: vi.fn().mockResolvedValue({ ok: true, result: { nonce: "7", digest: DIGEST } }),
    relay: vi.fn().mockResolvedValue({ ok: true, result: { trackingId: "track-1" } }),
  };
}

beforeEach(() => {
  useOperatorKeyStore.getState().clear();
  window.localStorage.clear();
});

describe("relayOperatorBatch", () => {
  it("refuses to sign when the tab holds no key", async () => {
    // A cleared store must say what is missing rather than fail somewhere inside
    // the relayer.
    await expect(relayOperatorBatch(CALLS, relayerDouble() as never)).rejects.toThrow(
      /No signing key in this session/,
    );
  });

  it("signs with the loaded paper wallet and sends a recoverable signature", async () => {
    const client = relayerDouble();
    useOperatorKeyStore.getState().adoptPrivateKey(PRIVATE_KEY);

    const result = await relayOperatorBatch(CALLS, client as never);

    expect(result).toEqual({ trackingId: "track-1", signatureType: "secp256k1" });

    const payload = client.relay.mock.calls[0]![0];
    expect(payload.signatureType).toBe("secp256k1");
    expect(payload.userAddress).toBe(privateKeyToAccount(PRIVATE_KEY).address);
    // Zero key hash is Calibur's root secp256k1 key.
    expect(payload.signedBatch.keyHash).toBe(`0x${"00".repeat(32)}`);
    expect(payload.signedBatch.nonce).toBe("7");
    expect(payload.signedBatch.executor).toBe(RELAYER);
    expect(payload.signedBatch.batchedCall).toEqual({ calls: CALLS, revertOnFailure: true });

    // Calibur unwraps (signature, hookData); the inner half must recover to the
    // operator, or the relayer would dispatch a batch nobody authorised.
    const [inner, hookData] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      payload.signature,
    );
    expect(hookData).toBe("0x");
    await expect(recoverAddress({ hash: DIGEST, signature: inner })).resolves.toBe(
      privateKeyToAccount(PRIVATE_KEY).address,
    );
  });

  it("always sends a delegation authorization with a paper wallet", async () => {
    // This console cannot read the EOA's bytecode to find out whether it is
    // already delegated, and clc-core rejects the job outright without one. The
    // relay worker ignores it when the account already delegates.
    const client = relayerDouble();
    useOperatorKeyStore.getState().adoptPrivateKey(PRIVATE_KEY);

    await relayOperatorBatch(CALLS, client as never);

    const { authorization } = client.relay.mock.calls[0]![0];
    expect(authorization).toMatchObject({ nonce: "3", chainId: expect.any(String) });
    // Signed over the account's own nonce, so it cannot be replayed.
    expect(client.getEOANonce).toHaveBeenCalledWith(privateKeyToAccount(PRIVATE_KEY).address);
  });

  it("sends no authorization for a passkey", async () => {
    // A credential can only exist on an account that already delegates.
    const client = relayerDouble();
    vi.stubGlobal("navigator", { credentials: { get: passkeyDouble() } });
    useOperatorKeyStore.getState().adoptPasskey({
      credentialId: CREDENTIAL_ID,
      keyHash: `0x${"11".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
      stale: false,
    });

    await relayOperatorBatch(CALLS, client as never);

    expect(client.relay.mock.calls[0]![0].authorization).toBeUndefined();
    expect(client.getEOANonce).not.toHaveBeenCalled();
  });

  it("signs the relayer's digest with the passkey and reports the webauthn type", async () => {
    const client = relayerDouble();
    const get = passkeyDouble();
    vi.stubGlobal("navigator", { credentials: { get } });

    useOperatorKeyStore.getState().adoptPasskey({
      credentialId: CREDENTIAL_ID,
      keyHash: `0x${"11".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
      stale: false,
    });

    const result = await relayOperatorBatch(CALLS, client as never);

    expect(result).toEqual({ trackingId: "track-1", signatureType: "webauthn" });
    const payload = client.relay.mock.calls[0]![0];
    expect(payload.signatureType).toBe("webauthn");
    expect(payload.signedBatch.keyHash).toBe(`0x${"11".repeat(32)}`);

    // The batch digest is the WebAuthn challenge, so the authenticator attests to
    // these calls rather than to a nonce standing in for them.
    const challenge = new Uint8Array(get.mock.calls[0]![0].publicKey.challenge);
    expect(Array.from(challenge)).toEqual(Array.from(hexToBytes(DIGEST)));
  });

  it("refuses a passkey the console has marked stale", async () => {
    useOperatorKeyStore.getState().adoptPasskey({
      credentialId: CREDENTIAL_ID,
      keyHash: `0x${"11".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
      stale: true,
    });

    await expect(relayOperatorBatch(CALLS, relayerDouble() as never)).rejects.toThrow(
      /stale; sign in again/,
    );
  });

  it("stops when the relayer reports no signer address", async () => {
    // Without an executor the batch would be signed for whoever the relayer
    // happens to dispatch as, which is not a promise the operator made.
    const client = relayerDouble();
    client.getHealth.mockResolvedValue({ ok: true, result: {} });
    useOperatorKeyStore.getState().adoptPrivateKey(PRIVATE_KEY);

    await expect(relayOperatorBatch(CALLS, client as never)).rejects.toThrow(/relayerAddress/);
    expect(client.relay).not.toHaveBeenCalled();
  });
});

describe("useOperatorKeyStore", () => {
  it("derives the address from the key rather than trusting a caller", () => {
    useOperatorKeyStore.getState().adoptPrivateKey(PRIVATE_KEY);

    expect(useOperatorKeyStore.getState().key).toEqual({
      kind: "privateKey",
      address: privateKeyToAccount(PRIVATE_KEY).address,
      privateKey: PRIVATE_KEY,
    });
  });

  it("holds nothing once cleared", () => {
    useOperatorKeyStore.getState().adoptPrivateKey(PRIVATE_KEY);
    useOperatorKeyStore.getState().clear();

    expect(useOperatorKeyStore.getState().key).toBeNull();
  });

  it("restores a paper-wallet key from local storage after a reload", async () => {
    useOperatorKeyStore.getState().adoptPrivateKey(PRIVATE_KEY);
    const persisted = window.localStorage.getItem(OPERATOR_KEY_STORAGE_KEY);

    expect(persisted).toContain(PRIVATE_KEY);

    // Rehydration is the store-level equivalent of loading the admin bundle in
    // a fresh tab. Put the saved value back after blanking the live store so the
    // assertion exercises storage rather than the current in-memory object.
    useOperatorKeyStore.setState({ key: null });
    window.localStorage.setItem(OPERATOR_KEY_STORAGE_KEY, persisted!);
    await useOperatorKeyStore.persist.rehydrate();

    expect(useOperatorKeyStore.getState().key).toEqual({
      kind: "privateKey",
      address: privateKeyToAccount(PRIVATE_KEY).address,
      privateKey: PRIVATE_KEY,
    });
  });

  it("does not persist the passkey signing record", () => {
    useOperatorKeyStore.getState().adoptPasskey({
      credentialId: CREDENTIAL_ID,
      keyHash: `0x${"11".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: "0x33a573149db22e759fB9A38Bcc461C12855c2645",
      stale: false,
    });

    expect(window.localStorage.getItem(OPERATOR_KEY_STORAGE_KEY)).not.toContain(CREDENTIAL_ID);
  });
});

function passkeyDouble() {
  return vi.fn().mockResolvedValue({
    response: {
      // A DER-encoded (r, s) pair, both small enough to need no normalization.
      signature: derSignature(),
      authenticatorData: new Uint8Array([1, 2, 3]).buffer,
      clientDataJSON: new TextEncoder().encode(
        JSON.stringify({ type: "webauthn.get", challenge: "abc", origin: "https://admin.test" }),
      ).buffer,
    },
  });
}

/** A minimal DER SEQUENCE of two 32-byte INTEGERs, as an authenticator returns. */
function derSignature(): ArrayBuffer {
  const r = new Uint8Array(32).fill(0x11);
  const s = new Uint8Array(32).fill(0x22);
  const bytes = [0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s];
  return new Uint8Array(bytes).buffer;
}
