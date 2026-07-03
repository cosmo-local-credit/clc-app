import type { RelayerClient } from "#/features/webauthn/api/relayer-client";
import { storePrivateKey } from "#/connectors/privateKey";
import { storeWebAuthnCredential } from "#/lib/webauthn-storage";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { requestWebAuthnAssertion } = vi.hoisted(() => ({
  requestWebAuthnAssertion: vi.fn(),
}));

vi.mock("#/features/webauthn/hooks/credential", () => ({ requestWebAuthnAssertion }));

import { buildVoucherTransferCall, relayVoucherTransfer } from "./send-voucher-relay";

const TOKEN = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const RECIPIENT = "0xa316408425cF17F1827483dee621c6C3A9B5fad4" as const;
const RELAYER = "0x1234567890123456789012345678901234567890" as const;
const USER = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const PRIVATE_KEY = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;
const DIGEST = `0x${"11".repeat(32)}` as const;

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

describe("buildVoucherTransferCall", () => {
  it("encodes an ERC-20 transfer call for the voucher token", () => {
    const call = buildVoucherTransferCall({
      tokenAddress: TOKEN,
      recipientAddress: RECIPIENT,
      amountRaw: "2130000",
    });

    expect(call).toMatchObject({ to: TOKEN, value: "0" });
    expect(call.data.startsWith("0xa9059cbb")).toBe(true);
  });
});

describe("relayVoucherTransfer", () => {
  it("previews, signs, and relays with the stored private key", async () => {
    const client = createClientStub();
    storePrivateKey(PRIVATE_KEY);

    await expect(
      relayVoucherTransfer(
        {
          senderAddress: USER,
          tokenAddress: TOKEN,
          recipientAddress: RECIPIENT,
          amountRaw: "2130000",
          includeAuthorization: true,
        },
        client,
      ),
    ).resolves.toEqual({ trackingId: "tracking-1", signatureType: "secp256k1" });

    expect(client.relayPreview).toHaveBeenCalledWith({
      userAddress: USER,
      batchedCall: {
        calls: [expect.objectContaining({ to: TOKEN, value: "0" })],
        revertOnFailure: true,
      },
      keyHash: ZERO_HASH,
      executor: RELAYER,
      deadline: "0",
    });
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: USER,
        signedBatch: expect.objectContaining({ nonce: "9", keyHash: ZERO_HASH }),
        signature: expect.stringMatching(/^0x/),
        signatureType: "secp256k1",
        authorization: expect.objectContaining({ nonce: "5" }),
      }),
    );
  });

  it("prefers a stored WebAuthn credential over the private key", async () => {
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
      relayVoucherTransfer(
        {
          senderAddress: USER,
          tokenAddress: TOKEN,
          recipientAddress: RECIPIENT,
          amountRaw: "2130000",
          includeAuthorization: true,
        },
        client,
      ),
    ).resolves.toEqual({ trackingId: "tracking-1", signatureType: "webauthn" });

    expect(client.getEOANonce).not.toHaveBeenCalled();
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: USER,
        signedBatch: expect.objectContaining({ keyHash: `0x${"aa".repeat(32)}` }),
        signatureType: "webauthn",
        authorization: undefined,
      }),
    );
  });
});
