import { describe, expect, it } from "vite-plus/test";
import { decodeFunctionData, zeroAddress } from "viem";
import {
  buildTransferPoolOwnershipCalls,
  ownableAbi,
  ownershipRecipientSchema,
  type PoolOwnershipContracts,
} from "./logic";
const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const contracts: PoolOwnershipContracts = {
  poolAddress: A(1),
  registryAddress: A(2),
  limiterAddress: A(3),
  feePolicyAddress: A(4),
  quoterAddress: A(5),
  protocolFeeControllerAddress: A(6),
  quoterType: "relative",
};
const ownerAddress = A(7),
  newOwnerAddress = A(8);
describe("pool ownership handover", () => {
  for (const quoterType of ["decimal", "relative", "oracle"] as const) {
    it(`encodes every owned target in ${quoterType} mode and preserves shared dependencies`, () => {
      const calls = buildTransferPoolOwnershipCalls({
        ...contracts,
        quoterType,
        ownerAddress,
        newOwnerAddress,
      });
      expect(calls.map((call) => call.to)).toEqual([
        A(2),
        A(3),
        A(4),
        ...(quoterType === "decimal" ? [] : [A(5)]),
        A(1),
      ]);
      for (const call of calls) {
        expect(call.value).toBe("0");
        expect(call.data.slice(0, 10)).toBe("0xf2fde38b");
        expect(decodeFunctionData({ abi: ownableAbi, data: call.data })).toEqual({
          functionName: "transferOwnership",
          args: [newOwnerAddress],
        });
      }
    });
  }
  for (const field of [
    "registryAddress",
    "limiterAddress",
    "feePolicyAddress",
    "quoterAddress",
  ] as const) {
    it(`refuses a missing ${field}`, () => {
      expect(() =>
        buildTransferPoolOwnershipCalls({
          ...contracts,
          [field]: null,
          ownerAddress,
          newOwnerAddress,
        }),
      ).toThrow(/no .* address/);
    });
  }
  it("refuses unknown pricing, duplicate wiring, current owner and contract recipients", () => {
    expect(() =>
      buildTransferPoolOwnershipCalls({
        ...contracts,
        quoterType: null,
        ownerAddress,
        newOwnerAddress,
      }),
    ).toThrow(/unknown/);
    expect(() =>
      buildTransferPoolOwnershipCalls({
        ...contracts,
        limiterAddress: contracts.poolAddress,
        ownerAddress,
        newOwnerAddress,
      }),
    ).toThrow(/overlapping/);
    for (const recipient of [
      "bad",
      zeroAddress,
      ownerAddress,
      ...Object.values(contracts).filter((v) => v?.startsWith("0x")),
    ]) {
      expect(
        ownershipRecipientSchema(ownerAddress, [
          contracts.poolAddress,
          contracts.registryAddress,
          contracts.limiterAddress,
          contracts.quoterAddress,
          contracts.feePolicyAddress,
          contracts.protocolFeeControllerAddress,
        ]).safeParse(recipient).success,
      ).toBe(false);
    }
  });
});
