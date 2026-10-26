import { describe, expect, it } from "vite-plus/test";
import {
  concatHex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
  type Hex,
} from "viem";
import {
  buildSafeTransaction,
  classifyOwnerCode,
  computeSafeTxHash,
  decodeSafeTransactionCalls,
  safeProposalAction,
  encodeMultiSend,
  isSigner,
  safeCallName,
  type SafeCall,
} from "./logic";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const safe = A(0xaaaa);
const multiSend = A(0xbbbb);
const callA: SafeCall = { to: A(1), value: "0", data: "0xf2fde38b" };
const callB: SafeCall = { to: A(2), value: "0", data: "0x1234567890" };

const word = (hex: Hex) => hex.slice(2).padStart(64, "0");

describe("safeTxHash", () => {
  it("matches the EIP-712 digest computed by hand", () => {
    const tx = buildSafeTransaction({ calls: [callA], nonce: "7", multiSendCallOnly: multiSend });
    const typeHash = keccak256(
      toHex(
        "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)",
      ),
    );
    const structHash = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint8" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "address" },
          { type: "address" },
          { type: "uint256" },
        ],
        [
          typeHash,
          callA.to,
          0n,
          keccak256(callA.data),
          0,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
          7n,
        ],
      ),
    );
    const domainHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }],
        [keccak256(toHex("EIP712Domain(uint256 chainId,address verifyingContract)")), 100n, safe],
      ),
    );
    const expected = keccak256(concatHex(["0x1901", domainHash, structHash]));
    expect(computeSafeTxHash(100, safe, tx)).toBe(expected);
  });

  it("binds the chain, the Safe and the nonce", () => {
    const tx = buildSafeTransaction({ calls: [callA], nonce: "1", multiSendCallOnly: multiSend });
    const base = computeSafeTxHash(100, safe, tx);
    expect(computeSafeTxHash(1, safe, tx)).not.toBe(base);
    expect(computeSafeTxHash(100, A(1), tx)).not.toBe(base);
    expect(computeSafeTxHash(100, safe, { ...tx, nonce: "2" })).not.toBe(base);
  });
});

describe("buildSafeTransaction", () => {
  it("sends a single call straight to its target with operation 0", () => {
    const tx = buildSafeTransaction({ calls: [callA], nonce: "3", multiSendCallOnly: multiSend });
    expect(tx).toMatchObject({ to: callA.to, data: callA.data, operation: 0, nonce: "3" });
    expect(tx.safeTxGas).toBe("0");
    expect(tx.gasPrice).toBe("0");
    expect(tx.refundReceiver).toBe(zeroAddress);
  });

  it("wraps a batch in the pinned MultiSendCallOnly with operation 1", () => {
    const tx = buildSafeTransaction({
      calls: [callA, callB],
      nonce: "3",
      multiSendCallOnly: multiSend,
    });
    expect(tx.to).toBe(multiSend);
    expect(tx.operation).toBe(1);
    expect(tx.value).toBe("0");
  });

  it("rejects an empty batch", () => {
    expect(() =>
      buildSafeTransaction({ calls: [], nonce: "0", multiSendCallOnly: multiSend }),
    ).toThrow();
  });
});

describe("encodeMultiSend", () => {
  it("packs each call as operation, to, value, length, data", () => {
    const { functionName, args } = decodeFunctionData({
      abi: parseAbi(["function multiSend(bytes transactions)"]),
      data: encodeMultiSend([callA, { ...callB, value: "5" }]),
    });
    expect(functionName).toBe("multiSend");
    const packed = args[0].slice(2);
    // first call: 00 | to | value 0 | length 4 | data
    expect(packed.slice(0, 2)).toBe("00");
    expect(packed.slice(2, 42)).toBe(callA.to.slice(2));
    expect(packed.slice(42, 106)).toBe(word("0x0"));
    expect(packed.slice(106, 170)).toBe(word("0x4"));
    expect(packed.slice(170, 178)).toBe("f2fde38b");
    // second call starts right after, value 5 and length 5
    const second = packed.slice(178);
    expect(second.slice(0, 2)).toBe("00");
    expect(second.slice(2, 42)).toBe(callB.to.slice(2));
    expect(second.slice(42, 106)).toBe(word("0x5"));
    expect(second.slice(106, 170)).toBe(word("0x5"));
    expect(second.slice(170)).toBe("1234567890");
  });
});

describe("owner classification", () => {
  it("treats empty code and an EIP-7702 delegation as an EOA", () => {
    expect(classifyOwnerCode("0x")).toBe("eoa");
    expect(classifyOwnerCode(undefined)).toBe("eoa");
    expect(classifyOwnerCode(`0xef0100${"ab".repeat(20)}`)).toBe("eoa");
  });
  it("treats other contract code as a contract to probe", () => {
    expect(classifyOwnerCode("0x6080604052")).toBe("contract");
    expect(classifyOwnerCode(`0xef0100${"ab".repeat(21)}`)).toBe("contract");
  });
  it("matches signers case-insensitively", () => {
    expect(isSigner(["0x00000000000000000000000000000000000000Ab"], A(0xab))).toBe(true);
    expect(isSigner([A(1)], undefined)).toBe(false);
  });
});

describe("decodeSafeTransactionCalls", () => {
  it("returns a plain call as is", () => {
    const tx = buildSafeTransaction({ calls: [callA], nonce: "0", multiSendCallOnly: multiSend });
    expect(decodeSafeTransactionCalls(tx, [multiSend])).toEqual([callA]);
  });
  it("round-trips a MultiSend batch", () => {
    const tx = buildSafeTransaction({
      calls: [callA, { ...callB, value: "7" }],
      nonce: "0",
      multiSendCallOnly: multiSend,
    });
    expect(decodeSafeTransactionCalls(tx, [multiSend])).toEqual([callA, { ...callB, value: "7" }]);
  });
  it("refuses a delegatecall to anything but the pinned MultiSend", () => {
    const tx = buildSafeTransaction({
      calls: [callA, callB],
      nonce: "0",
      multiSendCallOnly: multiSend,
    });
    expect(decodeSafeTransactionCalls({ ...tx, to: A(9) }, [multiSend])).toBeNull();
    expect(decodeSafeTransactionCalls(tx, [A(9)])).toBeNull();
  });
  it("names allowed owner actions and nothing else", () => {
    expect(safeCallName("0xf2fde38b0000")).toBe("transferOwnership");
    expect(safeCallName("0xdeadbeef")).toBeNull();
    expect(safeCallName("0x12")).toBeNull();
  });
});

describe("safeProposalAction", () => {
  const viewer = "0x00000000000000000000000000000000000000a1";
  const other = "0x00000000000000000000000000000000000000b2";
  const mint = {
    to: other,
    value: "0",
    data: encodeFunctionData({
      abi: parseAbi(["function mintTo(address,uint256)"]),
      functionName: "mintTo",
      args: [other, 1n],
    }),
  } as const;
  const base = { confirmationsRequired: 2, calls: [mint], viewer, canSign: true } as const;

  it("offers a signer the confirmation of an allowed call", () => {
    expect(safeProposalAction({ ...base, confirmations: [{ owner: other }] })).toBe("confirm");
  });
  it("sends a fully confirmed proposal to Safe for execution", () => {
    expect(
      safeProposalAction({
        ...base,
        confirmations: [{ owner: other }, { owner: viewer.toUpperCase() }],
      }),
    ).toBe("execute");
  });
  it("recognizes the viewer's own confirmation case-insensitively", () => {
    expect(safeProposalAction({ ...base, confirmations: [{ owner: viewer.toUpperCase() }] })).toBe(
      "confirmed",
    );
  });
  it("leaves undecodable, disallowed or unsignable proposals to Safe", () => {
    const none = { ...base, confirmations: [] };
    expect(safeProposalAction({ ...none, calls: null })).toBe("review");
    expect(safeProposalAction({ ...none, calls: [{ ...mint, data: "0x" }] })).toBe("review");
    expect(safeProposalAction({ ...none, canSign: false })).toBe("review");
  });
});
