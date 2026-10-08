import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRelayerClient, isRelaySubmissionUncertain, RelayerError } from "./client";

const BASE = "https://relayer.example";
const client = createRelayerClient(BASE);

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getHealth", () => {
  it("GETs /health and returns the relayer address", async () => {
    const spy = mockFetch({
      ok: true,
      result: { relayerAddress: "0xabc", chainId: 42220 },
    });
    const res = await client.getHealth();
    expect(spy).toHaveBeenCalledWith(`${BASE}/health`, expect.objectContaining({ method: "GET" }));
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/health`,
      expect.not.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(res.result.relayerAddress).toBe("0xabc");
  });
});

describe("getEOANonce", () => {
  it("GETs /nonce/:address and returns the nonce", async () => {
    const spy = mockFetch({ ok: true, result: { nonce: "7" } });
    const res = await client.getEOANonce("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(res.result.nonce).toBe("7");
  });
});

describe("trackRelay", () => {
  it("GETs /track/:trackingId and returns the OTX chain", async () => {
    const spy = mockFetch({
      ok: true,
      result: { otx: [{ trackingId: "uuid-1", status: "IN_NETWORK" }] },
    });
    const res = await client.trackRelay("uuid-1");
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/track/uuid-1`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(res.result.otx[0]?.trackingId).toBe("uuid-1");
  });
});

describe("getCaliburNonce", () => {
  it("GETs /calibur-nonce/:address for root key", async () => {
    const spy = mockFetch({ ok: true, result: { nonce: "3" } });
    await client.getCaliburNonce("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/calibur-nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`,
      expect.any(Object),
    );
  });

  it("GETs /calibur-nonce/:address/:keyHash for a keyed nonce", async () => {
    const spy = mockFetch({ ok: true, result: { nonce: "1" } });
    const keyHash = `0x${"aa".repeat(32)}`;
    await client.getCaliburNonce("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", keyHash);
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/calibur-nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/${keyHash}`,
      expect.any(Object),
    );
  });
});

describe("getWebAuthnChallenge", () => {
  it("GETs /webauthn/challenge and returns the challenge string", async () => {
    const spy = mockFetch({ ok: true, result: { challenge: "abc123" } });
    const res = await client.getWebAuthnChallenge();
    expect(spy).toHaveBeenCalledWith(`${BASE}/webauthn/challenge`, expect.any(Object));
    expect(res.result.challenge).toBe("abc123");
  });
});

describe("recoverWebAuthn", () => {
  it("POSTs the full assertion payload to /webauthn/recover", async () => {
    const spy = mockFetch({
      ok: true,
      result: {
        address: "0xabc",
        keyHash: `0x${"aa".repeat(32)}`,
        publicKeyX: "123",
        publicKeyY: "456",
      },
    });
    const payload = {
      credentialId: "cred-abc",
      authenticatorData: "authDataB64",
      clientDataJSON: "clientDataB64",
      signature: "sigB64",
    };
    const res = await client.recoverWebAuthn(payload);
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/webauthn/recover`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(res.result.address).toBe("0xabc");
  });

  it("throws a typed error when the backend returns 404", async () => {
    mockFetch({ ok: false, description: "Credential not found", errorCode: "E03" }, 404);
    await expect(
      client.recoverWebAuthn({
        credentialId: "unknown",
        authenticatorData: "a",
        clientDataJSON: "b",
        signature: "c",
      }),
    ).rejects.toThrow("not_found");
  });

  it("keeps a conflict's result so a pending registration can be followed", async () => {
    mockFetch(
      {
        ok: false,
        code: "E16",
        description: "webauthn registration is already pending",
        result: { state: "pending", trackingId: "t-1" },
      },
      409,
    );
    await expect(
      client.relay({
        userAddress: "0x1234567890123456789012345678901234567890",
        signedBatch: {
          batchedCall: { calls: [], revertOnFailure: true },
          nonce: "0",
          keyHash: `0x${"00".repeat(32)}`,
          executor: "0x1234567890123456789012345678901234567890",
          deadline: "0",
        },
        signature: "0x",
        signatureType: "secp256k1",
      }),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      result: { state: "pending", trackingId: "t-1" },
    });
  });

  it("throws a typed error when the backend returns 401", async () => {
    mockFetch({ ok: false, description: "Verification failed", errorCode: "E15" }, 401);
    await expect(
      client.recoverWebAuthn({
        credentialId: "bad",
        authenticatorData: "a",
        clientDataJSON: "b",
        signature: "c",
      }),
    ).rejects.toThrow("verification_failed");
  });
});

describe("relayPreview", () => {
  it("POSTs a batch preview to /relay/preview", async () => {
    const spy = mockFetch({
      ok: true,
      result: { nonce: "0", digest: `0x${"11".repeat(32)}` },
    });
    const payload = {
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      batchedCall: { calls: [], revertOnFailure: true },
      keyHash: `0x${"00".repeat(32)}` as `0x${string}`,
      executor: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      deadline: "0",
    };

    const res = await client.relayPreview(payload);

    expect(spy).toHaveBeenCalledWith(
      `${BASE}/relay/preview`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
    expect(res.result.digest).toBe(`0x${"11".repeat(32)}`);
  });
});

describe("relay", () => {
  it("POSTs a secp256k1 registration payload to /relay", async () => {
    const spy = mockFetch({
      ok: true,
      result: { trackingId: "uuid-1" },
    });
    const payload = {
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      signedBatch: {
        batchedCall: { calls: [], revertOnFailure: true },
        nonce: "0",
        keyHash: `0x${"00".repeat(32)}` as `0x${string}`,
        executor: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        deadline: "0",
      },
      signature: "0xabc" as `0x${string}`,
      signatureType: "secp256k1" as const,
    };
    const res = await client.relay(payload);
    expect(spy).toHaveBeenCalledWith(`${BASE}/relay`, expect.objectContaining({ method: "POST" }));
    expect(res.result.trackingId).toBe("uuid-1");
  });
});

describe("isRelaySubmissionUncertain", () => {
  it("treats a 4xx as a refusal that queued nothing", () => {
    expect(isRelaySubmissionUncertain(new RelayerError("server_error", "bad", 400))).toBe(false);
    expect(isRelaySubmissionUncertain(new RelayerError("conflict", "reused", 409))).toBe(false);
    expect(isRelaySubmissionUncertain(new RelayerError("verification_failed", "sig", 401))).toBe(
      false,
    );
  });

  it("treats a 5xx, a dropped connection or an unreadable body as unknown", () => {
    expect(isRelaySubmissionUncertain(new RelayerError("server_error", "gateway", 502))).toBe(true);
    expect(isRelaySubmissionUncertain(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRelaySubmissionUncertain(new SyntaxError("Unexpected token <"))).toBe(true);
  });
});

describe("relay with an operation id", () => {
  it("sends the operation id alongside the signed request", async () => {
    const spy = mockFetch({ ok: true, result: { trackingId: "uuid-2" } });
    await client.relay({
      operationId: "op-1",
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      signedBatch: {
        batchedCall: { calls: [], revertOnFailure: true },
        nonce: "0",
        keyHash: `0x${"00".repeat(32)}`,
        executor: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        deadline: "1700000000",
      },
      signature: "0xabc",
      signatureType: "secp256k1",
    });
    const body = JSON.parse(spy.mock.calls[0]?.[1]?.body as string);
    expect(body.operationId).toBe("op-1");
  });
});
