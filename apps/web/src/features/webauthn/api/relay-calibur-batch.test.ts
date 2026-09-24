import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { storePrivateKey } from "#/connectors/privateKey";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { RelayerClient } from "@clc/api/features/relayer/client";

const { requestWebAuthnAssertion } = vi.hoisted(() => ({
  requestWebAuthnAssertion: vi.fn(),
}));

vi.mock("#/features/webauthn/hooks/credential", () => ({ requestWebAuthnAssertion }));

import { relayCaliburBatch } from "./relay-calibur-batch";

const RELAYER = "0x1234567890123456789012345678901234567890" as const;
const USER = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const PRIVATE_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;
const DIGEST = `0x${"11".repeat(32)}` as const;
const CALLS: CaliburCall[] = [
  { to: "0x1111111111111111111111111111111111111111", value: "0", data: "0x01" },
  { to: "0x2222222222222222222222222222222222222222", value: "0", data: "0x02" },
];

function createClientStub(): RelayerClient {
  return {
    getHealth: vi.fn().mockResolvedValue({ result: { chainId: 42220, relayerAddress: RELAYER } }),
    getEOANonce: vi.fn().mockResolvedValue({ result: { nonce: "5" } }),
    getCaliburNonce: vi.fn(),
    trackRelay: vi.fn(),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi.fn().mockResolvedValue({ result: { nonce: "9", digest: DIGEST } }),
    relay: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  requestWebAuthnAssertion.mockReset();
});

describe("relayCaliburBatch", () => {
  it("previews and relays a multi-call batch with the stored private key", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);

    await expect(
      relayCaliburBatch(
        {
          senderAddress: USER,
          connectorId: "private-key",
          calls: CALLS,
          includeAuthorization: true,
          deadline: "123",
        },
        client,
      ),
    ).resolves.toEqual({ trackingId: "tracking-1", signatureType: "secp256k1" });

    expect(client.relayPreview).toHaveBeenCalledWith({
      userAddress: USER,
      batchedCall: { calls: CALLS, revertOnFailure: true },
      keyHash: ZERO_HASH,
      executor: RELAYER,
      deadline: "123",
    });
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: USER,
        signedBatch: expect.objectContaining({
          batchedCall: { calls: CALLS, revertOnFailure: true },
          nonce: "9",
          keyHash: ZERO_HASH,
          executor: RELAYER,
          deadline: "123",
        }),
        signatureType: "secp256k1",
        authorization: expect.objectContaining({ nonce: "5" }),
      }),
    );
  });

  it("previews and relays a multi-call batch with the stored WebAuthn credential", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);
    storeWebAuthnCredential({
      credentialId: "AQIDBA",
      keyHash: `0x${"aa".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: USER,
    });
    requestWebAuthnAssertion.mockResolvedValue({
      response: {
        signature: new Uint8Array([
          0x30,
          0x44,
          0x02,
          0x20,
          ...Array.from({ length: 32 }, () => 1),
          0x02,
          0x20,
          ...Array.from({ length: 32 }, () => 2),
        ]).buffer,
        authenticatorData: new Uint8Array([1, 2, 3]).buffer,
        clientDataJSON: new TextEncoder().encode('{"type":"webauthn.get","challenge":"abc"}')
          .buffer,
      },
    });

    await expect(
      relayCaliburBatch(
        {
          senderAddress: USER,
          connectorId: "calibur-webauthn",
          calls: CALLS,
          includeAuthorization: true,
        },
        client,
      ),
    ).resolves.toEqual({ trackingId: "tracking-1", signatureType: "webauthn" });

    expect(client.getEOANonce).not.toHaveBeenCalled();
    expect(client.relayPreview).toHaveBeenCalledWith({
      userAddress: USER,
      batchedCall: { calls: CALLS, revertOnFailure: true },
      keyHash: `0x${"aa".repeat(32)}`,
      executor: RELAYER,
      deadline: "0",
    });
    expect(requestWebAuthnAssertion).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        rpId: resolveRelyingPartyId(import.meta.env.VITE_RELYING_PARTY_ID),
      }),
    });
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: USER,
        signedBatch: expect.objectContaining({
          batchedCall: { calls: CALLS, revertOnFailure: true },
          keyHash: `0x${"aa".repeat(32)}`,
        }),
        signatureType: "webauthn",
        authorization: undefined,
      }),
    );
  });

  // A passkey linked from a paper-wallet session is stored before the connector
  // switch completes. If that switch fails, the session is still the paper
  // wallet's, and a credential on disk must not change how it signs.
  it("keeps signing with the paper key while connected through it, even with a passkey stored", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);
    storeWebAuthnCredential({
      credentialId: "AQIDBA",
      keyHash: `0x${"aa".repeat(32)}`,
      publicKeyX: "1",
      publicKeyY: "2",
      address: USER,
    });

    await expect(
      relayCaliburBatch({ senderAddress: USER, connectorId: "private-key", calls: CALLS }, client),
    ).resolves.toEqual({ trackingId: "tracking-1", signatureType: "secp256k1" });
    expect(requestWebAuthnAssertion).not.toHaveBeenCalled();
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({ signatureType: "secp256k1" }),
    );
  });

  it("refuses to sign without a connected wallet", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);

    await expect(
      relayCaliburBatch({ senderAddress: USER, connectorId: undefined, calls: CALLS }, client),
    ).rejects.toThrow(/no wallet is connected/i);
    expect(client.relay).not.toHaveBeenCalled();
  });
});
