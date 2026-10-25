import { describe, expect, it } from "vite-plus/test";
import {
  concatHex,
  decodeFunctionData,
  encodeAbiParameters,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
  type Hex,
} from "viem";
import {
  buildCancellationTransaction,
  buildExecuteSafeCall,
  buildSafeTransaction,
  classifyOwnerCode,
  computeSafeTxHash,
  deriveSafeStatus,
  encodeMultiSend,
  isSigner,
  packSignatures,
  type SafeCall,
} from "./logic";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const safe = A(0xaaaa);
const multiSend = A(0xbbbb);
const sig = (byte: string, v: "1b" | "1c" = "1b") => `0x${byte.repeat(64)}${v}` as Hex;
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

  it("builds a zero-value empty self-call for cancellation", () => {
    expect(buildCancellationTransaction(safe, "9")).toMatchObject({
      to: safe,
      value: "0",
      data: "0x",
      operation: 0,
      nonce: "9",
    });
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

describe("packSignatures", () => {
  it("orders by signer address ascending regardless of input order", () => {
    const low = { owner: A(0x01), signature: sig("11") };
    const mid = { owner: A(0x0f), signature: sig("22") };
    const high = { owner: A(0xff), signature: sig("33", "1c") };
    const packed = packSignatures([high, low, mid]);
    expect(packed).toBe(concatHex([low.signature, mid.signature, high.signature]));
  });

  it("compares addresses numerically, not by checksum casing", () => {
    const upper = {
      owner: "0x00000000000000000000000000000000000000Ab" as const,
      signature: sig("11"),
    };
    const lower = {
      owner: "0x00000000000000000000000000000000000000cd" as const,
      signature: sig("22"),
    };
    expect(packSignatures([lower, upper])).toBe(concatHex([upper.signature, lower.signature]));
  });

  it("rejects wrong length, wrong v and duplicate signers", () => {
    expect(() => packSignatures([{ owner: A(1), signature: "0x1234" }])).toThrow(/65 bytes/);
    expect(() =>
      packSignatures([{ owner: A(1), signature: sig("11", "1c").replace(/1c$/, "00") as Hex }]),
    ).toThrow(/27 or 28/);
    expect(() =>
      packSignatures([
        { owner: A(1), signature: sig("11") },
        { owner: A(1), signature: sig("22") },
      ]),
    ).toThrow(/Duplicate/);
  });
});

describe("buildExecuteSafeCall", () => {
  it("targets the Safe with zero value and decodes back to the transaction", () => {
    const tx = buildSafeTransaction({
      calls: [callA, callB],
      nonce: "4",
      multiSendCallOnly: multiSend,
    });
    const confirmations = [
      { owner: A(2), signature: sig("22") },
      { owner: A(1), signature: sig("11") },
    ];
    const call = buildExecuteSafeCall(safe, tx, confirmations);
    expect(call.to).toBe(safe);
    expect(call.value).toBe("0");
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool success)",
      ]),
      data: call.data,
    });
    expect(decoded.args[0].toLowerCase()).toBe(multiSend);
    expect(decoded.args[3]).toBe(1);
    expect(decoded.args[9]).toBe(concatHex([sig("11"), sig("22")]));
  });
});

describe("deriveSafeStatus", () => {
  const base = { confirmations: 1, threshold: 2, safeNonce: 5n, txNonce: 5n, executed: false };
  it("is pending below threshold and ready at it", () => {
    expect(deriveSafeStatus(base)).toBe("pending");
    expect(deriveSafeStatus({ ...base, confirmations: 2 })).toBe("ready");
  });
  it("shows replaced, never failed, when another transaction took the nonce", () => {
    expect(deriveSafeStatus({ ...base, safeNonce: 6n })).toBe("replaced");
  });
  it("keeps a reverted execution retryable: the nonce is unused so it stays ready", () => {
    expect(deriveSafeStatus({ ...base, confirmations: 2 })).toBe("ready");
  });
  it("reports executed and failed only from an executed transaction", () => {
    expect(deriveSafeStatus({ ...base, executed: true, safeNonce: 6n })).toBe("executed");
    expect(
      deriveSafeStatus({ ...base, executed: true, safeNonce: 6n, executedSuccessfully: false }),
    ).toBe("failed");
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
