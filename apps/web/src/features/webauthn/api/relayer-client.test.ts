import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRelayerClient } from "./relayer-client";

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

// ── getHealth ────────────────────────────────────────────────────────────────
describe("getHealth", () => {
	it("GETs /health and returns the relayer address", async () => {
		const spy = mockFetch({
			ok: true,
			result: { relayerAddress: "0xabc", chainId: 42220 },
		});
		const res = await client.getHealth();
		expect(spy).toHaveBeenCalledWith(`${BASE}/health`, expect.any(Object));
		expect(res.result.relayerAddress).toBe("0xabc");
	});
});

// ── getEOANonce ──────────────────────────────────────────────────────────────
describe("getEOANonce", () => {
	it("GETs /nonce/:address and returns the nonce", async () => {
		const spy = mockFetch({ ok: true, result: { nonce: "7" } });
		const res = await client.getEOANonce(
			"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		);
		expect(spy).toHaveBeenCalledWith(
			`${BASE}/nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`,
			expect.any(Object),
		);
		expect(res.result.nonce).toBe("7");
	});
});

// ── getCaliburNonce ──────────────────────────────────────────────────────────
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
		const keyHash = "0x" + "aa".repeat(32);
		await client.getCaliburNonce(
			"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
			keyHash,
		);
		expect(spy).toHaveBeenCalledWith(
			`${BASE}/calibur-nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/${keyHash}`,
			expect.any(Object),
		);
	});
});

// ── getWebAuthnChallenge ─────────────────────────────────────────────────────
describe("getWebAuthnChallenge", () => {
	it("GETs /webauthn/challenge and returns the challenge string", async () => {
		const spy = mockFetch({ ok: true, result: { challenge: "abc123" } });
		const res = await client.getWebAuthnChallenge();
		expect(spy).toHaveBeenCalledWith(
			`${BASE}/webauthn/challenge`,
			expect.any(Object),
		);
		expect(res.result.challenge).toBe("abc123");
	});
});

// ── recoverWebAuthn ──────────────────────────────────────────────────────────
describe("recoverWebAuthn", () => {
	it("POSTs the full assertion payload to /webauthn/recover", async () => {
		const spy = mockFetch({
			ok: true,
			result: {
				address: "0xabc",
				keyHash: "0x" + "aa".repeat(32),
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
		mockFetch(
			{ ok: false, description: "Credential not found", errorCode: "E03" },
			404,
		);
		await expect(
			client.recoverWebAuthn({
				credentialId: "unknown",
				authenticatorData: "a",
				clientDataJSON: "b",
				signature: "c",
			}),
		).rejects.toThrow("not_found");
	});

	it("throws a typed error when the backend returns 401", async () => {
		mockFetch(
			{ ok: false, description: "Verification failed", errorCode: "E15" },
			401,
		);
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

// ── relay ────────────────────────────────────────────────────────────────────
describe("relay", () => {
	it("POSTs a secp256k1 registration payload to /relay", async () => {
		const spy = mockFetch({
			ok: true,
			result: { txHash: "0xdeadbeef", trackingId: "uuid-1" },
		});
		const payload = {
			userAddress:
				"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
			signedBatch: {
				batchedCall: { calls: [], revertOnFailure: true },
				nonce: "0",
				keyHash: ("0x" + "00".repeat(32)) as `0x${string}`,
				executor: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
				deadline: "0",
			},
			signature: "0xabc" as `0x${string}`,
			signatureType: "secp256k1" as const,
		};
		const res = await client.relay(payload);
		expect(spy).toHaveBeenCalledWith(
			`${BASE}/relay`,
			expect.objectContaining({ method: "POST" }),
		);
		expect(res.result.txHash).toBe("0xdeadbeef");
	});
});
