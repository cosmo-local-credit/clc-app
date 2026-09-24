import type { RelayerClient } from "@clc/api/features/relayer/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { readCaliburDelegation, createWebAuthnPasskey } = vi.hoisted(() => ({
  readCaliburDelegation: vi.fn(),
  createWebAuthnPasskey: vi.fn(),
}));

vi.mock("#/features/webauthn/api/calibur-delegation", () => ({ readCaliburDelegation }));
vi.mock("#/features/webauthn/hooks/credential", () => ({ createWebAuthnPasskey }));

import { registerPasskey } from "./register-passkey";

const PRIVATE_KEY = `0x${"aa".repeat(32)}` as const;
const USER = "0x8fd379246834eac74B8419FfdA202CF8051F7A03";
const RELAYER = "0x1234567890123456789012345678901234567890";
// The P-256 generator point, as base64url JWK coordinates.
const GX = "axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY";
const GY = "T-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU";

function createClientStub(): RelayerClient {
  return {
    getHealth: vi.fn().mockResolvedValue({ result: { chainId: 100, relayerAddress: RELAYER } }),
    getEOANonce: vi.fn().mockResolvedValue({ result: { nonce: "3" } }),
    getCaliburNonce: vi.fn().mockResolvedValue({ result: { nonce: "7" } }),
    trackRelay: vi.fn(),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi.fn(),
    relay: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  };
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(globalThis, "PublicKeyCredential", {
    configurable: true,
    value: class PublicKeyCredentialMock {},
  });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create: vi.fn(), get: vi.fn() },
  });
  createWebAuthnPasskey.mockResolvedValue({
    id: "cred-1",
    response: { getPublicKey: () => new ArrayBuffer(91) },
  });
  vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
  vi.spyOn(crypto.subtle, "exportKey").mockResolvedValue({ x: GX, y: GY } as JsonWebKey);
});

afterEach(() => {
  vi.restoreAllMocks();
  readCaliburDelegation.mockReset();
  createWebAuthnPasskey.mockReset();
});

describe("registerPasskey", () => {
  it("adds an EIP-7702 authorization for a wallet not yet delegated", async () => {
    readCaliburDelegation.mockResolvedValue(false);
    const client = createClientStub();

    const registration = await registerPasskey(PRIVATE_KEY, client);

    expect(readCaliburDelegation).toHaveBeenCalledWith(USER);
    expect(client.getEOANonce).toHaveBeenCalledWith(USER);
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: USER,
        signatureType: "secp256k1",
        authorization: expect.objectContaining({ nonce: "3", chainId: "100" }),
        credentialId: "cred-1",
        signedBatch: expect.objectContaining({
          nonce: "7",
          keyHash: `0x${"00".repeat(32)}`,
          executor: RELAYER,
          batchedCall: {
            calls: [expect.objectContaining({ to: USER, value: "0" })],
            revertOnFailure: true,
          },
        }),
      }),
    );
    expect(registration).toMatchObject({
      trackingId: "tracking-1",
      credentialId: "cred-1",
      address: USER,
    });
  });

  // An admin-issued card that has already sent a transaction, or a paper-only
  // signup activated during onboarding, is delegated. clc-core ignores an
  // authorization for it, so none is requested or signed.
  it("neither reads the EOA nonce nor signs an authorization for a delegated wallet", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = createClientStub();
    const steps: string[] = [];

    await registerPasskey(PRIVATE_KEY, client, (step) => steps.push(step));

    expect(client.getEOANonce).not.toHaveBeenCalled();
    expect(client.relay).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: undefined, credentialId: "cred-1" }),
    );
    expect(steps).toEqual(["authorizing", "creating-passkey", "registering"]);
  });

  it("relays nothing when the platform prompt is cancelled", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    createWebAuthnPasskey.mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
    const client = createClientStub();

    await expect(registerPasskey(PRIVATE_KEY, client)).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    expect(client.relay).not.toHaveBeenCalled();
  });

  it("does not open the platform prompt when delegation cannot be read", async () => {
    readCaliburDelegation.mockRejectedValue(new Error("rpc down"));
    const client = createClientStub();

    await expect(registerPasskey(PRIVATE_KEY, client)).rejects.toThrow("rpc down");
    expect(createWebAuthnPasskey).not.toHaveBeenCalled();
    expect(client.relay).not.toHaveBeenCalled();
  });
});
