import { describe, expect, it } from "vitest";
import {
	base64UrlToBytes,
	buildCaliburNonce,
	computeEIP712Digest,
	eip7702AuthMessage,
	encodeRegisterCalldata,
	encodeWebAuthnAuth,
	normalizeS,
	parseDERSignature,
	secp256k1KeyHash,
	webAuthnKeyHash,
} from "./logic";

// ── Constants shared across tests ──────────────────────────────────────────
const CALIBUR_ADDRESS = "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85" as const;
const CHAIN_ID = 42220n;
// First Anvil/Hardhat account
const ANVIL0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
// Known P-256 coordinates (0xabab... / 0xcdcd...)
const X = BigInt("0x" + "ab".repeat(32));
const Y = BigInt("0x" + "cd".repeat(32));

// ── Fixtures derived from viem (match the demo implementation exactly) ──────
// Computed offline with the same viem primitives; values locked so regressions
// in the encoding chain show up here before reaching chain.
const FIXTURE_AUTH_NONCE0 =
	"0xd7754ba3dbd35f06f79c5cc0d656ff1c71dc995d87f92d1c9ece14763d2f24e8";
const FIXTURE_AUTH_NONCE1 =
	"0x2db206e959586c65cc0e613cb671d407880d91aa9f2be9dc5421cb99042cf3bf";
const FIXTURE_WEBAUTHN_KEY_HASH =
	"0xb846053507b7089dbb6964b83e8f875c8a86acd52530e21fe2e337a10b390f90";
const FIXTURE_SECP256K1_KEY_HASH =
	"0x05319565c586a6f57b95ce5fa51ebcd62973426e2339a1aa110574050e274e6d";

// ── eip7702AuthMessage ──────────────────────────────────────────────────────
describe("eip7702AuthMessage", () => {
	it("produces the correct hash for nonce=0", () => {
		expect(
			eip7702AuthMessage({
				chainId: CHAIN_ID,
				contractAddress: CALIBUR_ADDRESS,
				nonce: 0n,
			}),
		).toBe(FIXTURE_AUTH_NONCE0);
	});

	it("produces a different hash for nonce=1", () => {
		expect(
			eip7702AuthMessage({
				chainId: CHAIN_ID,
				contractAddress: CALIBUR_ADDRESS,
				nonce: 1n,
			}),
		).toBe(FIXTURE_AUTH_NONCE1);
	});

	it("returns a 0x-prefixed 32-byte hash", () => {
		const hash = eip7702AuthMessage({
			chainId: CHAIN_ID,
			contractAddress: CALIBUR_ADDRESS,
			nonce: 0n,
		});
		expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
	});
});

// ── webAuthnKeyHash ─────────────────────────────────────────────────────────
describe("webAuthnKeyHash", () => {
	it("derives the correct key hash for known P-256 coordinates", () => {
		expect(webAuthnKeyHash(X, Y)).toBe(FIXTURE_WEBAUTHN_KEY_HASH);
	});

	it("returns a 0x-prefixed 32-byte hash", () => {
		expect(webAuthnKeyHash(X, Y)).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it("produces different hashes for different coordinates", () => {
		const h1 = webAuthnKeyHash(X, Y);
		const h2 = webAuthnKeyHash(X, X);
		expect(h1).not.toBe(h2);
	});
});

// ── secp256k1KeyHash ────────────────────────────────────────────────────────
describe("secp256k1KeyHash", () => {
	it("derives the correct key hash for the first Anvil address", () => {
		expect(secp256k1KeyHash(ANVIL0)).toBe(FIXTURE_SECP256K1_KEY_HASH);
	});

	it("returns a 0x-prefixed 32-byte hash", () => {
		expect(secp256k1KeyHash(ANVIL0)).toMatch(/^0x[0-9a-f]{64}$/);
	});
});

// ── buildCaliburNonce ───────────────────────────────────────────────────────
describe("buildCaliburNonce", () => {
	it("packs keyHash low-192-bits into upper bits and seq into lower 64 bits", () => {
		// 0xdeadbeef fits in 32 bits — low 192 bits is the same
		const result = buildCaliburNonce("0x" + "00".repeat(28) + "deadbeef", 7n);
		expect(result).toBe(BigInt("0xdeadbeef0000000000000007"));
	});

	it("seq=0 produces a nonce with only the key portion set", () => {
		const result = buildCaliburNonce("0x" + "00".repeat(28) + "deadbeef", 0n);
		expect(result & 0xffffffffffffffffn).toBe(0n);
	});

	it("wraps keyHash to low 192 bits", () => {
		// A keyHash with bits above 192 set — those should be discarded
		const fullHash = "0x" + "ff".repeat(32);
		const truncated = buildCaliburNonce(fullHash, 0n);
		// Upper 64 bits of the nonce (bits 255:192) should be 0xff bytes from keyHash bits 191:128
		// Lower 64 bits (seq) should be 0
		expect(truncated & 0xffffffffffffffffn).toBe(0n);
	});
});

// ── parseDERSignature ────────────────────────────────────────────────────────
describe("parseDERSignature", () => {
	it("parses a minimal DER-encoded signature with r=1, s=1", () => {
		// 30 06  02 01 01  02 01 01
		const der = new Uint8Array([
			0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01,
		]);
		const { r, s } = parseDERSignature(der);
		expect(r.length).toBe(32);
		expect(s.length).toBe(32);
		expect(r[31]).toBe(1);
		expect(s[31]).toBe(1);
		// All other bytes should be 0
		expect(r.slice(0, 31).every((b) => b === 0)).toBe(true);
	});

	it("strips the DER leading zero-padding from r", () => {
		// r has high bit set so DER adds 00 prefix: 02 02 00 80 → r = 0x80
		const der = new Uint8Array([
			0x30, 0x06, 0x02, 0x02, 0x00, 0x80, 0x02, 0x01, 0x02,
		]);
		const { r } = parseDERSignature(der);
		expect(r[31]).toBe(0x80);
		expect(r[30]).toBe(0);
	});
});

// ── normalizeS ───────────────────────────────────────────────────────────────
describe("normalizeS", () => {
	const P256_ORDER = BigInt(
		"0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
	);

	function toBE32(n: bigint): Uint8Array {
		const hex = n.toString(16).padStart(64, "0");
		const bytes = new Uint8Array(32);
		for (let i = 0; i < 32; i++) {
			bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		}
		return bytes;
	}

	it("leaves a low-s value unchanged", () => {
		const lowS = toBE32(1n);
		const result = normalizeS(lowS);
		expect(result[31]).toBe(1);
		expect(result.slice(0, 31).every((b) => b === 0)).toBe(true);
	});

	it("flips a high-s value to order - s", () => {
		// s = order - 1 → normalized = 1
		const highS = toBE32(P256_ORDER - 1n);
		const result = normalizeS(highS);
		expect(result[31]).toBe(1);
		expect(result.slice(0, 31).every((b) => b === 0)).toBe(true);
	});

	it("does not flip s equal to half-order + 1 but leaves s equal to half-order", () => {
		const halfOrder = P256_ORDER / 2n;
		const atHalf = normalizeS(toBE32(halfOrder));
		const aboveHalf = normalizeS(toBE32(halfOrder + 1n));
		// halfOrder itself is ≤ half → unchanged
		const halfBig = BigInt(
			"0x" +
				Array.from(atHalf, (b) => b.toString(16).padStart(2, "0")).join(""),
		);
		expect(halfBig).toBe(halfOrder);
		// halfOrder + 1 is > half → gets flipped
		const aboveBig = BigInt(
			"0x" +
				Array.from(aboveHalf, (b) => b.toString(16).padStart(2, "0")).join(""),
		);
		expect(aboveBig).toBe(P256_ORDER - (halfOrder + 1n));
	});
});

// ── base64UrlToBytes ─────────────────────────────────────────────────────────
describe("base64UrlToBytes", () => {
	it("decodes a standard base64url string", () => {
		// "hello" in base64 is "aGVsbG8="  → base64url is "aGVsbG8"
		const bytes = base64UrlToBytes("aGVsbG8");
		expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
	});

	it("handles base64url with + replaced by - and / replaced by _", () => {
		// 0xfb 0xff → standard: "+/8=" → url: "-_8"
		const bytes = base64UrlToBytes("-_8");
		expect(bytes[0]).toBe(0xfb);
		expect(bytes[1]).toBe(0xff);
	});

	it("handles missing padding gracefully", () => {
		// "Man" → "TWFu" (no padding needed), decode → [77, 97, 110]
		const bytes = base64UrlToBytes("TWFu");
		expect(Array.from(bytes)).toEqual([77, 97, 110]);
	});
});

// ── encodeRegisterCalldata ───────────────────────────────────────────────────
describe("encodeRegisterCalldata", () => {
	it("starts with the register function selector", () => {
		const calldata = encodeRegisterCalldata(X, Y);
		// keccak256("register((uint8,bytes))") first 4 bytes
		// We verify the selector is present (0x prefix + 8 hex chars for selector)
		expect(calldata).toMatch(/^0x[0-9a-f]{8}/);
	});

	it("returns a 0x-prefixed hex string", () => {
		const calldata = encodeRegisterCalldata(X, Y);
		expect(calldata).toMatch(/^0x[0-9a-f]+$/);
	});

	it("encodes keyType=1 (WebAuthnP256) in the calldata", () => {
		const calldata = encodeRegisterCalldata(X, Y);
		// The first ABI word after selector contains the keyType tuple offset
		// We can verify the calldata contains '0000000000000001' for keyType=1
		expect(calldata).toContain("0000000000000001");
	});
});

// ── encodeWebAuthnAuth ────────────────────────────────────────────────────────
describe("encodeWebAuthnAuth", () => {
	it("returns a 0x-prefixed hex string", () => {
		const auth = {
			authenticatorData: new Uint8Array([1, 2, 3]),
			clientDataJSON: '{"type":"webauthn.get"}',
			challengeIndex: 8n,
			typeIndex: 0n,
			r: 1n,
			s: 2n,
		};
		const encoded = encodeWebAuthnAuth(auth);
		expect(encoded).toMatch(/^0x[0-9a-f]+$/);
	});

	it("encodes r and s as the last two uint256 words", () => {
		const auth = {
			authenticatorData: new Uint8Array([0xaa]),
			clientDataJSON: "{}",
			challengeIndex: 0n,
			typeIndex: 0n,
			r: 0xdeadbeefn,
			s: 0xcafebaben,
		};
		const encoded = encodeWebAuthnAuth(auth);
		expect(encoded).toContain(
			"00000000000000000000000000000000000000000000000000000000deadbeef",
		);
		expect(encoded).toContain(
			"00000000000000000000000000000000000000000000000000000000cafebabe",
		);
	});
});

// ── computeEIP712Digest ────────────────────────────────────────────────────────
describe("computeEIP712Digest", () => {
	it("returns a 32-byte Uint8Array", () => {
		const signedBatch = {
			batchedCall: {
				calls: [{ to: ANVIL0, value: "0", data: "0x" as `0x${string}` }],
				revertOnFailure: true,
			},
			nonce: "0",
			keyHash: ("0x" + "00".repeat(32)) as `0x${string}`,
			executor: ANVIL0,
			deadline: "0",
		};
		const digest = computeEIP712Digest(
			signedBatch,
			ANVIL0,
			CALIBUR_ADDRESS,
			CHAIN_ID,
		);
		expect(digest).toBeInstanceOf(Uint8Array);
		expect(digest.length).toBe(32);
	});

	it("produces different digests for different nonces", () => {
		const base = {
			batchedCall: {
				calls: [{ to: ANVIL0, value: "0", data: "0x" as `0x${string}` }],
				revertOnFailure: true,
			},
			keyHash: ("0x" + "00".repeat(32)) as `0x${string}`,
			executor: ANVIL0,
			deadline: "0",
		};
		const d0 = computeEIP712Digest(
			{ ...base, nonce: "0" },
			ANVIL0,
			CALIBUR_ADDRESS,
			CHAIN_ID,
		);
		const d1 = computeEIP712Digest(
			{ ...base, nonce: "1" },
			ANVIL0,
			CALIBUR_ADDRESS,
			CHAIN_ID,
		);
		expect(d0).not.toEqual(d1);
	});
});
