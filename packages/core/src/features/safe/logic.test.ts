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
  buildSafeSignerChangeCall,
  buildSafeTransaction,
  classifyOwnerCode,
  computeSafeTxHash,
  decodeSafeTransactionCalls,
  describeSafeCall,
  encodeSafeContractSignature,
  safeProposalAction,
  safeSupportsContractSignatures,
  encodeMultiSend,
  isSigner,
  safeCallName,
  safeOwnerChange,
  safeSignerChangeProblem,
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
    const on = (data: Hex): SafeCall => ({ to: A(1), value: "0", data });
    expect(safeCallName(on("0xf2fde38b0000"), safe)).toBe("transferOwnership");
    expect(safeCallName(on("0xdeadbeef"), safe)).toBeNull();
    expect(safeCallName(on("0x12"), safe)).toBeNull();
  });
});

describe("safeOwnerChange", () => {
  const signer = A(0x5151);
  const other = A(0x6262);
  const sentinel = A(1);
  const ownerAbi = parseAbi([
    "function addOwnerWithThreshold(address,uint256)",
    "function removeOwner(address,address,uint256)",
    "function swapOwner(address,address,address)",
    "function changeThreshold(uint256)",
    "function enableModule(address)",
    "function setGuard(address)",
    "function setFallbackHandler(address)",
  ]);
  const self = (data: Hex): SafeCall => ({ to: safe, value: "0", data });
  const add = (o: `0x${string}`, n: bigint) =>
    encodeFunctionData({ abi: ownerAbi, functionName: "addOwnerWithThreshold", args: [o, n] });
  const remove = (prev: `0x${string}`, o: `0x${string}`, n: bigint) =>
    encodeFunctionData({ abi: ownerAbi, functionName: "removeOwner", args: [prev, o, n] });
  const swap = (prev: `0x${string}`, from: `0x${string}`, to: `0x${string}`) =>
    encodeFunctionData({ abi: ownerAbi, functionName: "swapOwner", args: [prev, from, to] });
  const threshold = (n: bigint) =>
    encodeFunctionData({ abi: ownerAbi, functionName: "changeThreshold", args: [n] });

  it("reads each signer change the Safe makes on itself", () => {
    expect(safeOwnerChange(self(add(signer, 2n)), safe)).toEqual({
      kind: "addSigner",
      signer,
      threshold: 2,
    });
    expect(safeOwnerChange(self(remove(sentinel, signer, 1n)), safe)).toEqual({
      kind: "removeSigner",
      signer,
      threshold: 1,
    });
    expect(safeOwnerChange(self(swap(other, signer, A(0x7373))), safe)).toEqual({
      kind: "replaceSigner",
      oldSigner: signer,
      newSigner: A(0x7373),
    });
    expect(safeOwnerChange(self(threshold(3n)), safe)).toEqual({
      kind: "changeThreshold",
      threshold: 3,
    });
  });

  it("names them as allowed, and only on the Safe itself", () => {
    expect(safeCallName(self(add(signer, 2n)), safe)).toBe("addSigner");
    expect(safeCallName({ to: A(1), value: "0", data: add(signer, 2n) }, safe)).toBeNull();
    expect(safeOwnerChange({ to: A(1), value: "0", data: threshold(1n) }, safe)).toBeNull();
  });

  it("refuses the changes clc-core refuses", () => {
    const dirty = `${add(signer, 1n).slice(0, 10)}ff${add(signer, 1n).slice(12)}` as Hex;
    const refused: Record<string, Hex> = {
      "the zero address": add(zeroAddress, 1n),
      "the sentinel": add(sentinel, 1n),
      "the Safe itself": add(safe, 1n),
      "a zero threshold": add(signer, 0n),
      "removing the sentinel": remove(signer, sentinel, 1n),
      "removing to a zero threshold": remove(sentinel, signer, 0n),
      "swapping in the zero address": swap(sentinel, signer, zeroAddress),
      "swapping a signer for itself": swap(sentinel, signer, signer),
      "a zero threshold change": threshold(0n),
      "trailing bytes": `${threshold(1n)}00`,
      "a dirty address word": dirty,
      "enabling a module": encodeFunctionData({
        abi: ownerAbi,
        functionName: "enableModule",
        args: [signer],
      }),
      "setting a guard": encodeFunctionData({
        abi: ownerAbi,
        functionName: "setGuard",
        args: [signer],
      }),
      "setting the fallback handler": encodeFunctionData({
        abi: ownerAbi,
        functionName: "setFallbackHandler",
        args: [signer],
      }),
    };
    for (const [name, data] of Object.entries(refused)) {
      expect(safeOwnerChange(self(data), safe), name).toBeNull();
      expect(safeCallName(self(data), safe), name).toBeNull();
    }
  });

  it("lets a signer confirm an owner change, and leaves a refused one to Safe", () => {
    const base = {
      safe,
      confirmations: [{ owner: other }],
      confirmationsRequired: 2,
      viewer: signer,
      canSign: true,
    };
    expect(safeProposalAction({ ...base, calls: [self(add(A(0x8888), 2n))] })).toBe("confirm");
    expect(
      safeProposalAction({
        ...base,
        calls: [self(add(A(0x8888), 2n)), self(threshold(3n))],
      }),
    ).toBe("confirm");
    expect(safeProposalAction({ ...base, calls: [self(add(sentinel, 2n))] })).toBe("review");
    expect(
      safeProposalAction({
        ...base,
        calls: [
          self(encodeFunctionData({ abi: ownerAbi, functionName: "setGuard", args: [signer] })),
        ],
      }),
    ).toBe("review");
  });

  it("describes an owner change for the confirming signer", () => {
    expect(describeSafeCall(self(swap(sentinel, signer, other)), safe)).toEqual({
      kind: "replaceSigner",
      oldSigner: signer,
      newSigner: other,
    });
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
  const base = { safe, confirmationsRequired: 2, calls: [mint], viewer, canSign: true } as const;

  it("offers a signer the confirmation of an allowed call", () => {
    expect(safeProposalAction({ ...base, confirmations: [{ owner: other }] })).toBe("confirm");
  });
  it("shows a fully confirmed proposal clc-core is executing", () => {
    expect(
      safeProposalAction({
        ...base,
        executing: true,
        confirmations: [{ owner: other }, { owner: viewer }],
      }),
    ).toBe("executing");
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

describe("describeSafeCall", () => {
  const token = "0x2222222222222222222222222222222222222222";
  const person = "0x9999999999999999999999999999999999999999";
  it("reads a mint's recipient and raw amount", () => {
    const data = encodeFunctionData({
      abi: parseAbi(["function mintTo(address,uint256)"]),
      functionName: "mintTo",
      args: [person, 1_500_000n],
    });
    expect(describeSafeCall({ to: token, value: "0", data }, safe)).toEqual({
      kind: "mint",
      token,
      recipient: person,
      amountRaw: "1500000",
    });
  });
  it("reads an ownership transfer's new owner", () => {
    const data = encodeFunctionData({
      abi: parseAbi(["function transferOwnership(address)"]),
      functionName: "transferOwnership",
      args: [person],
    });
    expect(describeSafeCall({ to: token, value: "0", data }, safe)).toEqual({
      kind: "ownership",
      asset: token,
      newOwner: person,
    });
  });
  it("has nothing to say about other calls", () => {
    expect(describeSafeCall({ to: token, value: "0", data: "0x12345678" }, safe)).toBeNull();
  });
});

describe("contract signatures", () => {
  it("are verified the bytes32 way from Safe 1.5.0 on", () => {
    for (const version of ["1.5.0", "1.5.0+L2", "1.6.0", "2.0.0"])
      expect(safeSupportsContractSignatures(version), version).toBe(true);
    for (const version of ["1.4.1", "1.3.0", "1.1.1", "", "custom", "1", undefined])
      expect(safeSupportsContractSignatures(version), String(version)).toBe(false);
  });

  it("encode as r = owner, s = 65, v = 0 and the length-prefixed data", () => {
    const owner = A(0xa1);
    const data = "0x0102030405" as const;
    expect(encodeSafeContractSignature(owner, data)).toBe(
      `0x${word(owner)}${word("0x41")}00${word("0x05")}0102030405`,
    );
  });
});

describe("signer change proposals", () => {
  const [first, second, third, newcomer] = [A(0x11), A(0x22), A(0x33), A(0x44)];
  // getOwners order, which is not address order.
  const state = { safe, owners: [third, first, second], threshold: 2 };
  const ownerAbi = parseAbi([
    "function addOwnerWithThreshold(address,uint256)",
    "function removeOwner(address,address,uint256)",
    "function changeThreshold(uint256)",
  ]);

  it("names the removed signer's predecessor in the Safe's own order", () => {
    const decoded = (signer: `0x${string}`) =>
      decodeFunctionData({
        abi: ownerAbi,
        data: buildSafeSignerChangeCall(state, { kind: "removeSigner", signer, threshold: 1 }).data,
      }).args;
    expect(decoded(third)).toEqual([A(1), third, 1n]);
    expect(decoded(first)).toEqual([third, first, 1n]);
    expect(decoded(second)).toEqual([first, second, 1n]);
  });

  it("builds calls clc-app itself reads back as the same change", () => {
    const add = buildSafeSignerChangeCall(state, {
      kind: "addSigner",
      signer: newcomer,
      threshold: 3,
    });
    expect(add.to).toBe(safe);
    expect(add.value).toBe("0");
    expect(safeOwnerChange(add, safe)).toEqual({
      kind: "addSigner",
      signer: newcomer,
      threshold: 3,
    });
    const threshold = buildSafeSignerChangeCall(state, { kind: "changeThreshold", threshold: 3 });
    expect(safeOwnerChange(threshold, safe)).toEqual({ kind: "changeThreshold", threshold: 3 });
    const remove = buildSafeSignerChangeCall(state, {
      kind: "removeSigner",
      signer: first,
      threshold: 2,
    });
    expect(safeOwnerChange(remove, safe)).toEqual({
      kind: "removeSigner",
      signer: first,
      threshold: 2,
    });
  });

  it("refuses the changes the Safe would refuse", () => {
    const cases: [Parameters<typeof safeSignerChangeProblem>[1], string][] = [
      [{ kind: "addSigner", signer: zeroAddress, threshold: 1 }, "not-a-signer-address"],
      [{ kind: "addSigner", signer: A(1), threshold: 1 }, "not-a-signer-address"],
      [{ kind: "addSigner", signer: safe, threshold: 1 }, "not-a-signer-address"],
      [{ kind: "addSigner", signer: first, threshold: 1 }, "already-signer"],
      [{ kind: "addSigner", signer: newcomer, threshold: 5 }, "threshold-out-of-range"],
      [{ kind: "addSigner", signer: newcomer, threshold: 0 }, "threshold-out-of-range"],
      [{ kind: "removeSigner", signer: newcomer, threshold: 1 }, "not-signer"],
      [{ kind: "removeSigner", signer: first, threshold: 3 }, "threshold-out-of-range"],
      [{ kind: "changeThreshold", threshold: 4 }, "threshold-out-of-range"],
      [{ kind: "changeThreshold", threshold: 2 }, "unchanged"],
    ];
    for (const [change, problem] of cases) {
      expect(safeSignerChangeProblem(state, change), JSON.stringify(change)).toBe(problem);
      expect(() => buildSafeSignerChangeCall(state, change)).toThrow(problem);
    }
    expect(
      safeSignerChangeProblem(
        { safe, owners: [first], threshold: 1 },
        { kind: "removeSigner", signer: first, threshold: 1 },
      ),
    ).toBe("last-signer");
    expect(
      safeSignerChangeProblem(state, { kind: "addSigner", signer: newcomer, threshold: 4 }),
    ).toBeNull();
  });
});
