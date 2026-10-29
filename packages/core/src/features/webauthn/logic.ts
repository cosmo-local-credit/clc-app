import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  hashTypedData,
  keccak256,
  pad,
  parseAbi,
  toHex,
  toRlp,
} from "viem";

export function eip7702AuthMessage(args: {
  chainId: bigint;
  contractAddress: `0x${string}`;
  nonce: bigint;
}): `0x${string}` {
  const rlp = toRlp([
    args.chainId === 0n ? "0x" : toHex(args.chainId),
    args.contractAddress,
    args.nonce === 0n ? "0x" : toHex(args.nonce),
  ]);
  return keccak256(concat(["0x05", rlp]));
}

/**
 * EIP-7702 account code prefix (`0xef0100`) — when an EOA delegates its code to
 * a contract, `eth_getCode` at the EOA returns this prefix followed by the
 * delegated contract's 20-byte address. See EIP-7702.
 */
const EIP7702_DELEGATION_PREFIX = "0xef0100" as const;

/**
 * The exact bytecode `eth_getCode` returns for an EOA that has delegated its
 * code to `contractAddress` under EIP-7702. Compare this against viem's
 * `getCode` / wagmi's `useBytecode` result to confirm a delegation is live.
 */
export function eip7702DelegationCode(contractAddress: `0x${string}`): `0x${string}` {
  return concat([EIP7702_DELEGATION_PREFIX, contractAddress]).toLowerCase() as `0x${string}`;
}

/**
 * True when `bytecode` (from `getCode` / `useBytecode`) is exactly an
 * EIP-7702 delegation to `contractAddress`. `undefined` / empty → `false`.
 */
export function isEip7702Delegated(
  bytecode: `0x${string}` | undefined | null,
  contractAddress: `0x${string}`,
): boolean {
  if (!bytecode) return false;
  return bytecode.toLowerCase() === eip7702DelegationCode(contractAddress);
}

export function webAuthnKeyHash(x: bigint, y: bigint): `0x${string}` {
  const publicKey = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [x, y]);
  const publicKeyHash = keccak256(publicKey);
  const keyTypePadded = encodeAbiParameters([{ type: "uint8" }], [1]);
  return keccak256(concat([keyTypePadded, publicKeyHash]));
}

export function secp256k1KeyHash(address: `0x${string}`): `0x${string}` {
  const publicKey = encodeAbiParameters([{ type: "address" }], [address]);
  const publicKeyHash = keccak256(publicKey);
  const keyTypePadded = encodeAbiParameters([{ type: "uint8" }], [2]);
  return keccak256(concat([keyTypePadded, publicKeyHash]));
}

export function buildCaliburNonce(keyHash: `0x${string}`, seq: bigint): bigint {
  const keyBig = BigInt(keyHash) & ((1n << 192n) - 1n);
  return (keyBig << 64n) | seq;
}

const REGISTER_ABI = [
  {
    name: "register",
    type: "function",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "keyType", type: "uint8" },
          { name: "publicKey", type: "bytes" },
        ],
      },
    ],
  },
] as const;

export function encodeRegisterCalldata(x: bigint, y: bigint): `0x${string}` {
  const publicKey = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [x, y]);
  return encodeFunctionData({
    abi: REGISTER_ABI,
    functionName: "register",
    args: [{ keyType: 1, publicKey }],
  });
}

const PERSONAL_SIGN_TYPEHASH = keccak256(toHex("PersonalSign(bytes prefixed)"));

/** Calibur's own EIP-712 domain, read from the account it is delegated to. */
export const caliburDomainAbi = parseAbi(["function domainSeparator() view returns (bytes32)"]);

/**
 * The digest a Calibur key signs for `isValidSignature(hash, ...)`: ERC-7739's
 * nested PersonalSign, `hash` wrapped in the account's own EIP-712 domain so a
 * signature for one account cannot be replayed on another the same passkey
 * controls. `domainSeparator` is the account's on-chain `domainSeparator()`.
 */
export function caliburNestedPersonalSignDigest(
  domainSeparator: `0x${string}`,
  hash: `0x${string}`,
): `0x${string}` {
  const structHash = keccak256(concat([PERSONAL_SIGN_TYPEHASH, hash]));
  return keccak256(concat(["0x1901", domainSeparator, structHash]));
}

/**
 * Calibur's `isValidSignature` payload for a registered key:
 * `abi.encode(keyHash, signature, hookData)`. The batch path's wrapper differs;
 * it carries the keyHash in the signed batch instead.
 */
export function encodeCaliburErc1271Signature(
  keyHash: `0x${string}`,
  signature: `0x${string}`,
): `0x${string}` {
  return encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes" }, { type: "bytes" }],
    [keyHash, signature, "0x"],
  );
}

export type CaliburCall = {
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
};

export type SignedBatch = {
  batchedCall: { calls: CaliburCall[]; revertOnFailure: boolean };
  nonce: string;
  keyHash: `0x${string}`;
  executor: `0x${string}`;
  deadline: string;
};

const EIP712_TYPES = {
  SignedBatchedCall: [
    { name: "batchedCall", type: "BatchedCall" },
    { name: "nonce", type: "uint256" },
    { name: "keyHash", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
  BatchedCall: [
    { name: "calls", type: "Call[]" },
    { name: "revertOnFailure", type: "bool" },
  ],
  Call: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

export function computeEIP712Digest(
  signedBatch: SignedBatch,
  userAddress: `0x${string}`,
  caliburAddress: `0x${string}`,
  chainId: bigint,
): Uint8Array {
  const domain = {
    name: "Calibur",
    version: "1.0.0",
    chainId,
    verifyingContract: userAddress,
    salt: pad(caliburAddress, { size: 32 }),
  };
  const message = {
    batchedCall: {
      calls: signedBatch.batchedCall.calls.map((call) => ({
        ...call,
        value: BigInt(call.value),
      })),
      revertOnFailure: signedBatch.batchedCall.revertOnFailure,
    },
    nonce: BigInt(signedBatch.nonce),
    keyHash: signedBatch.keyHash,
    executor: signedBatch.executor,
    deadline: BigInt(signedBatch.deadline),
  };
  const digest = hashTypedData({
    domain,
    types: EIP712_TYPES,
    primaryType: "SignedBatchedCall",
    message,
  });
  return hexToBytes(digest);
}

export function parseDERSignature(derSig: Uint8Array): {
  r: Uint8Array;
  s: Uint8Array;
} {
  let offset = 2; // skip 0x30 + total length

  if (derSig[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for r");
  offset++;
  const rLen = derSig[offset];
  offset++;
  const rRaw = derSig.slice(offset, offset + rLen);
  offset += rLen;

  if (derSig[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for s");
  offset++;
  const sLen = derSig[offset];
  offset++;
  const sRaw = derSig.slice(offset, offset + sLen);

  return {
    r: padTo32(trimLeadingZeros(rRaw)),
    s: padTo32(trimLeadingZeros(sRaw)),
  };
}

function trimLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

function padTo32(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 32) return bytes.slice(bytes.length - 32);
  const padded = new Uint8Array(32);
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

const P256_ORDER = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");
const P256_HALF_ORDER = P256_ORDER / 2n;

export function normalizeS(sBytes: Uint8Array): Uint8Array {
  const sBig = bytesToBigInt(sBytes);
  if (sBig > P256_HALF_ORDER) {
    return bigIntToBytes32(P256_ORDER - sBig);
  }
  return sBytes;
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export type WebAuthnAuth = {
  authenticatorData: Uint8Array;
  clientDataJSON: string;
  challengeIndex: bigint;
  typeIndex: bigint;
  r: bigint;
  s: bigint;
};

export function encodeWebAuthnAuth(auth: WebAuthnAuth): `0x${string}` {
  const authDataHex = toHex(auth.authenticatorData);
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "authenticatorData", type: "bytes" },
          { name: "clientDataJSON", type: "string" },
          { name: "challengeIndex", type: "uint256" },
          { name: "typeIndex", type: "uint256" },
          { name: "r", type: "uint256" },
          { name: "s", type: "uint256" },
        ],
      },
    ],
    [
      {
        authenticatorData: authDataHex,
        clientDataJSON: auth.clientDataJSON,
        challengeIndex: auth.challengeIndex,
        typeIndex: auth.typeIndex,
        r: auth.r,
        s: auth.s,
      },
    ],
  );
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`);
}

function bigIntToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const body = hex.slice(2);
  const bytes = new Uint8Array(body.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
