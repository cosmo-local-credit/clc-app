import type { AuthClient, WebAuthnCredentialSummary } from "@clc/api/features/auth/client";
import { RelayerError, type RelayerClient } from "@clc/api/features/relayer/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { readCaliburDelegation } = vi.hoisted(() => ({ readCaliburDelegation: vi.fn() }));
vi.mock("#/features/webauthn/api/calibur-delegation", () => ({ readCaliburDelegation }));

import { relinkMovedPasskeys, UnsettledRegistrationError } from "./relink-passkey";

const NEW_KEY = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const RELAYER = "0x1234567890123456789012345678901234567890" as const;
const DIGEST = `0x${"11".repeat(32)}` as const;

function credential(
  credentialId: string,
  state: WebAuthnCredentialSummary["state"],
  trackingId: string | null = null,
): WebAuthnCredentialSummary {
  return { credentialId, state, createdAt: "", trackingId, publicKeyX: "1", publicKeyY: "2" };
}

function auth(credentials: WebAuthnCredentialSummary[]) {
  return {
    getWebAuthnCredentials: vi.fn().mockResolvedValue({ address: "0x", credentials }),
  } as unknown as AuthClient;
}

function relayer(): RelayerClient {
  return {
    getHealth: vi.fn().mockResolvedValue({ result: { chainId: 100, relayerAddress: RELAYER } }),
    getEOANonce: vi.fn().mockResolvedValue({ result: { nonce: "0" } }),
    getCaliburNonce: vi.fn(),
    trackRelay: vi.fn().mockResolvedValue({
      ok: true,
      result: {
        otx: [
          {
            id: 1,
            trackingId: "t",
            otxType: "RELAY",
            txHash: "0x1",
            nonce: 1,
            replaced: false,
            createdAt: "",
            status: "SUCCESS",
          },
        ],
      },
    }),
    delegate: vi.fn(),
    getWebAuthnChallenge: vi.fn(),
    recoverWebAuthn: vi.fn(),
    relayPreview: vi.fn().mockResolvedValue({ result: { nonce: "1", digest: DIGEST } }),
    relay: vi.fn().mockResolvedValue({ result: { trackingId: "tracking-1" } }),
  } as unknown as RelayerClient;
}

const relayed = (client: RelayerClient) =>
  vi.mocked(client.relay).mock.calls.map(([payload]) => payload.credentialId);

afterEach(() => readCaliburDelegation.mockReset());

describe("relinkMovedPasskeys", () => {
  it("skips a passkey already registered and moves on to the next", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    await relinkMovedPasskeys({
      auth: auth([credential("a", "active"), credential("b", "moved")]),
      relayer: client,
      newKey: NEW_KEY,
    });
    expect(relayed(client)).toEqual(["b"]);
  });

  it("follows a registration still settling instead of relaying it again", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    await relinkMovedPasskeys({
      auth: auth([credential("a", "pending", "tracking-a")]),
      relayer: client,
      newKey: NEW_KEY,
    });
    expect(client.relay).not.toHaveBeenCalled();
    expect(client.trackRelay).toHaveBeenCalledWith("tracking-a");
  });

  it("resends a lost response as the identical request", async () => {
    readCaliburDelegation.mockResolvedValue(false);
    const client = relayer();
    vi.mocked(client.relay)
      .mockRejectedValueOnce(new RelayerError("server_error", "bad gateway", 502))
      .mockResolvedValueOnce({ ok: true, result: { trackingId: "tracking-1" } } as never);
    await relinkMovedPasskeys({
      auth: auth([credential("b", "moved")]),
      relayer: client,
      newKey: NEW_KEY,
    });

    const [first, second] = vi.mocked(client.relay).mock.calls.map(([payload]) => payload);
    expect(second).toEqual(first);
    expect(first?.operationId).toBeTruthy();
    expect(client.relayPreview).toHaveBeenCalledTimes(1);
  });

  it("takes an accepted registration's answer from the relay's conflict", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    vi.mocked(client.relay).mockRejectedValueOnce(
      new RelayerError("conflict", "pending", 409, { state: "pending", trackingId: "tracking-b" }),
    );
    await relinkMovedPasskeys({
      auth: auth([credential("b", "moved")]),
      relayer: client,
      newKey: NEW_KEY,
    });
    expect(client.trackRelay).toHaveBeenCalledWith("tracking-b");
  });

  it("tries every passkey before reporting the first failure", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    vi.mocked(client.relay).mockRejectedValueOnce(new RelayerError("server_error", "refused", 400));
    await expect(
      relinkMovedPasskeys({
        auth: auth([credential("a", "moved"), credential("b", "moved")]),
        relayer: client,
        newKey: NEW_KEY,
      }),
    ).rejects.toThrow();
    expect(relayed(client)).toEqual(["a", "b"]);
  });

  it("stops at a registration whose outcome is unknown instead of signing the next", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    vi.mocked(client.trackRelay).mockRejectedValueOnce(
      new RelayerError("server_error", "tracker unavailable", 503),
    );
    await expect(
      relinkMovedPasskeys({
        auth: auth([credential("a", "moved"), credential("b", "moved")]),
        relayer: client,
        newKey: NEW_KEY,
      }),
    ).rejects.toBeInstanceOf(UnsettledRegistrationError);
    expect(relayed(client)).toEqual(["a"]);
    expect(client.relayPreview).toHaveBeenCalledTimes(1);
  });

  it("leaves a passkey that failed outside a rotation to the passkey settings", async () => {
    readCaliburDelegation.mockResolvedValue(true);
    const client = relayer();
    await relinkMovedPasskeys({
      auth: auth([credential("a", "failed"), credential("b", "unverified")]),
      relayer: client,
      newKey: NEW_KEY,
    });
    expect(client.relay).not.toHaveBeenCalled();
  });
});
