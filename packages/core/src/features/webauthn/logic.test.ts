import { decodeAbiParameters } from "viem";
import { describe, expect, it } from "vite-plus/test";
import {
  base64UrlToBytes,
  buildCaliburNonce,
  caliburNestedPersonalSignDigest,
  computeEIP712Digest,
  eip7702AuthMessage,
  eip7702DelegationCode,
  encodeCaliburErc1271Signature,
  encodeRegisterCalldata,
  encodeWebAuthnAuth,
  isEip7702Delegated,
  normalizeS,
  parseDERSignature,
  secp256k1KeyHash,
  webAuthnKeyHash,
} from "./logic";

const CALIBUR_ADDRESS = "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85" as const;
const CHAIN_ID = 42220n;
const ANVIL0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const X = BigInt(`0x${"ab".repeat(32)}`);
const Y = BigInt(`0x${"cd".repeat(32)}`);

const FIXTURE_AUTH_NONCE0 = "0xd7754ba3dbd35f06f79c5cc0d656ff1c71dc995d87f92d1c9ece14763d2f24e8";
const FIXTURE_AUTH_NONCE1 = "0x2db206e959586c65cc0e613cb671d407880d91aa9f2be9dc5421cb99042cf3bf";
const FIXTURE_WEBAUTHN_KEY_HASH =
  "0xb846053507b7089dbb6964b83e8f875c8a86acd52530e21fe2e337a10b390f90";
const FIXTURE_SECP256K1_KEY_HASH =
  "0x05319565c586a6f57b95ce5fa51ebcd62973426e2339a1aa110574050e274e6d";

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

describe("secp256k1KeyHash", () => {
  it("derives the correct key hash for the first Anvil address", () => {
    expect(secp256k1KeyHash(ANVIL0)).toBe(FIXTURE_SECP256K1_KEY_HASH);
  });

  it("returns a 0x-prefixed 32-byte hash", () => {
    expect(secp256k1KeyHash(ANVIL0)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("buildCaliburNonce", () => {
  it("packs keyHash low-192-bits into upper bits and seq into lower 64 bits", () => {
    const result = buildCaliburNonce(`0x${"00".repeat(28)}deadbeef`, 7n);
    expect(result).toBe(BigInt("0xdeadbeef0000000000000007"));
  });

  it("seq=0 produces a nonce with only the key portion set", () => {
    const result = buildCaliburNonce(`0x${"00".repeat(28)}deadbeef`, 0n);
    expect(result & 0xffffffffffffffffn).toBe(0n);
  });

  it("wraps keyHash to low 192 bits", () => {
    const fullHash = `0x${"ff".repeat(32)}` as `0x${string}`;
    const truncated = buildCaliburNonce(fullHash, 0n);
    expect(truncated & 0xffffffffffffffffn).toBe(0n);
  });
});

describe("parseDERSignature", () => {
  it("parses a minimal DER-encoded signature with r=1, s=1", () => {
    const der = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);
    const { r, s } = parseDERSignature(der);
    expect(r.length).toBe(32);
    expect(s.length).toBe(32);
    expect(r[31]).toBe(1);
    expect(s[31]).toBe(1);
    expect(r.slice(0, 31).every((b) => b === 0)).toBe(true);
  });

  it("strips the DER leading zero-padding from r", () => {
    const der = new Uint8Array([0x30, 0x06, 0x02, 0x02, 0x00, 0x80, 0x02, 0x01, 0x02]);
    const { r } = parseDERSignature(der);
    expect(r[31]).toBe(0x80);
    expect(r[30]).toBe(0);
  });
});

describe("normalizeS", () => {
  const P256_ORDER = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");

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
    const highS = toBE32(P256_ORDER - 1n);
    const result = normalizeS(highS);
    expect(result[31]).toBe(1);
    expect(result.slice(0, 31).every((b) => b === 0)).toBe(true);
  });

  it("does not flip s equal to half-order + 1 but leaves s equal to half-order", () => {
    const halfOrder = P256_ORDER / 2n;
    const atHalf = normalizeS(toBE32(halfOrder));
    const aboveHalf = normalizeS(toBE32(halfOrder + 1n));
    const halfBig = BigInt(
      "0x" + Array.from(atHalf, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    expect(halfBig).toBe(halfOrder);
    const aboveBig = BigInt(
      "0x" + Array.from(aboveHalf, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    expect(aboveBig).toBe(P256_ORDER - (halfOrder + 1n));
  });
});

describe("base64UrlToBytes", () => {
  it("decodes a standard base64url string", () => {
    const bytes = base64UrlToBytes("aGVsbG8");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles base64url with + replaced by - and / replaced by _", () => {
    const bytes = base64UrlToBytes("-_8");
    expect(bytes[0]).toBe(0xfb);
    expect(bytes[1]).toBe(0xff);
  });

  it("handles missing padding gracefully", () => {
    const bytes = base64UrlToBytes("TWFu");
    expect(Array.from(bytes)).toEqual([77, 97, 110]);
  });
});

describe("encodeRegisterCalldata", () => {
  it("starts with the register function selector", () => {
    const calldata = encodeRegisterCalldata(X, Y);
    expect(calldata).toMatch(/^0x[0-9a-f]{8}/);
  });

  it("returns a 0x-prefixed hex string", () => {
    const calldata = encodeRegisterCalldata(X, Y);
    expect(calldata).toMatch(/^0x[0-9a-f]+$/);
  });

  it("encodes keyType=1 (WebAuthnP256) in the calldata", () => {
    const calldata = encodeRegisterCalldata(X, Y);
    expect(calldata).toContain("0000000000000001");
  });
});

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
    expect(encoded).toContain("00000000000000000000000000000000000000000000000000000000deadbeef");
    expect(encoded).toContain("00000000000000000000000000000000000000000000000000000000cafebabe");
  });
});

describe("computeEIP712Digest", () => {
  it("returns a 32-byte Uint8Array", () => {
    const signedBatch = {
      batchedCall: {
        calls: [{ to: ANVIL0, value: "0", data: "0x" as `0x${string}` }],
        revertOnFailure: true,
      },
      nonce: "0",
      keyHash: `0x${"00".repeat(32)}` as `0x${string}`,
      executor: ANVIL0,
      deadline: "0",
    };
    const digest = computeEIP712Digest(signedBatch, ANVIL0, CALIBUR_ADDRESS, CHAIN_ID);
    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest.length).toBe(32);
  });

  it("produces different digests for different nonces", () => {
    const base = {
      batchedCall: {
        calls: [{ to: ANVIL0, value: "0", data: "0x" as `0x${string}` }],
        revertOnFailure: true,
      },
      keyHash: `0x${"00".repeat(32)}` as `0x${string}`,
      executor: ANVIL0,
      deadline: "0",
    };
    const d0 = computeEIP712Digest({ ...base, nonce: "0" }, ANVIL0, CALIBUR_ADDRESS, CHAIN_ID);
    const d1 = computeEIP712Digest({ ...base, nonce: "1" }, ANVIL0, CALIBUR_ADDRESS, CHAIN_ID);
    expect(d0).not.toEqual(d1);
  });
});

describe("eip7702DelegationCode", () => {
  it("prefixes the address with the EIP-7702 magic and lowercases", () => {
    expect(eip7702DelegationCode(CALIBUR_ADDRESS)).toBe(
      `0xef0100${CALIBUR_ADDRESS.slice(2).toLowerCase()}`,
    );
  });

  it("normalises an upper-case address to lowercase", () => {
    const upper = "0x1289FE793392FB1A905F78EA23F632EDD3D15B85" as `0x${string}`;
    expect(eip7702DelegationCode(upper)).toBe(eip7702DelegationCode(CALIBUR_ADDRESS));
  });
});

describe("isEip7702Delegated", () => {
  it("returns true for the exact delegation bytecode", () => {
    expect(isEip7702Delegated(eip7702DelegationCode(CALIBUR_ADDRESS), CALIBUR_ADDRESS)).toBe(true);
  });

  it("is case-insensitive on the observed bytecode", () => {
    const code = `0xEF0100${CALIBUR_ADDRESS.slice(2)}` as `0x${string}`;
    expect(isEip7702Delegated(code, CALIBUR_ADDRESS)).toBe(true);
  });

  it("returns false for a different contract delegation", () => {
    expect(isEip7702Delegated(`0xef0100${ANVIL0.slice(2)}`, CALIBUR_ADDRESS)).toBe(false);
  });

  it("returns false for a regular contract (non-delegation code)", () => {
    expect(isEip7702Delegated("0xdeadbeef", CALIBUR_ADDRESS)).toBe(false);
  });

  it("returns false for undefined / empty bytecode", () => {
    expect(isEip7702Delegated(undefined, CALIBUR_ADDRESS)).toBe(false);
    expect(isEip7702Delegated(null, CALIBUR_ADDRESS)).toBe(false);
  });
});

describe("Calibur ERC-1271 signatures", () => {
  it("nests a hash in the account's PersonalSign as clc-core's fork-tested vector does", () => {
    // TestNestedPersonalSignDigestVector in clc-core internal/safe, whose
    // formula executes against the deployed Calibur on a Gnosis fork.
    expect(caliburNestedPersonalSignDigest(`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`)).toBe(
      "0x91bdbc83f28b75d3df4fac8452de56db0c16cc019f4209875dbca3048d0c160f",
    );
  });

  it("wraps a key's signature as abi.encode(keyHash, signature, hookData)", () => {
    const keyHash = `0x${"55".repeat(32)}` as const;
    expect(
      decodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes" }, { type: "bytes" }],
        encodeCaliburErc1271Signature(keyHash, "0xa11ce0"),
      ),
    ).toEqual([keyHash, "0xa11ce0", "0x"]);
  });
});
