import { decodeFunctionData, getAddress, toHex } from "viem";
import { describe, expect, it } from "vite-plus/test";

import {
  POOL_SEAL_FEE,
  POOL_SEAL_FEE_ADDRESS,
  swapPoolSetFeeAddressAbi,
} from "../pool-admin/logic";
import type { CaliburCall } from "../webauthn/index";
import {
  buildKeyRotationStatement,
  keyRotationPasskeyChallenge,
  MAX_CALIBUR_BATCH_CALLS,
  planKeyRotationBatches,
  poolRotationCalls,
  type RotationGroup,
} from "./logic";

const OLD = "0x6a347ba6b1ec10348478377c5fcee7ceb6921a69";
const NEW = "0xf4e5a91e30903f508735943a78fe382dfb18da22";
const POOL = "0x1111111111111111111111111111111111111111";

function calls(count: number, to = POOL): CaliburCall[] {
  return Array.from({ length: count }, (_, index) => ({
    to: to as `0x${string}`,
    value: "0",
    data: `0x${index.toString(16).padStart(2, "0")}` as `0x${string}`,
  }));
}

function group(kind: RotationGroup["kind"], count: number, seed: number): RotationGroup {
  const address = `0x${seed.toString(16).padStart(40, "0")}` as `0x${string}`;
  return { kind, address, calls: calls(count, address) };
}

describe("buildKeyRotationStatement", () => {
  it("names both cards checksummed, word for word what clc-core parses", () => {
    expect(buildKeyRotationStatement(OLD, NEW)).toBe(
      "Replace sign-in card 0x6a347bA6B1eC10348478377c5fCeE7Ceb6921A69 with 0xf4e5A91e30903F508735943a78Fe382dfB18Da22",
    );
  });
});

describe("keyRotationPasskeyChallenge", () => {
  it("matches clc-core's challenge for the same statement and nonce", () => {
    const challenge = keyRotationPasskeyChallenge(
      buildKeyRotationStatement(OLD, NEW),
      "rotationnonce1",
    );
    // base64url 81nFFKgfqdSng7C5HyqExTO9Yz3y397Yh3GtRCQwWhw in clc-core's test.
    expect(toHex(challenge)).toBe(
      "0xf359c514a81fa9d4a783b0b91f2a84c533bd633df2dfded88771ad4424305a1c",
    );
  });
});

describe("planKeyRotationBatches", () => {
  it("moves ownership before balances and never mixes them in one batch", () => {
    const batches = planKeyRotationBatches([
      group("balance", 1, 1),
      group("voucher", 1, 2),
      group("native", 1, 3),
      group("pool", 5, 4),
    ]);
    expect(batches.map((batch) => batch.groups.map((g) => g.kind))).toEqual([
      ["pool", "voucher"],
      ["balance", "native"],
    ]);
  });

  it("keeps each pool's calls in one batch and stays under the relay cap", () => {
    const pools = Array.from({ length: 4 }, (_, index) => group("pool", 6, index + 1));
    const batches = planKeyRotationBatches(pools);
    // 6 + 6 fit, a third pool would make 18.
    expect(batches.map((batch) => batch.calls.length)).toEqual([12, 12]);
    for (const batch of batches) {
      expect(batch.calls.length).toBeLessThanOrEqual(MAX_CALIBUR_BATCH_CALLS);
      for (const g of batch.groups) expect(batch.calls).toEqual(expect.arrayContaining(g.calls));
    }
  });

  it("packs many single-call groups into full batches in their order", () => {
    const vouchers = Array.from({ length: 20 }, (_, index) => group("voucher", 1, index + 1));
    const batches = planKeyRotationBatches(vouchers);
    expect(batches.map((batch) => batch.calls.length)).toEqual([16, 4]);
    expect(batches.flatMap((batch) => batch.groups)).toEqual(vouchers);
  });

  it("drops empty groups and plans nothing for nothing", () => {
    expect(planKeyRotationBatches([])).toEqual([]);
    expect(planKeyRotationBatches([group("voucher", 0, 1)])).toEqual([]);
  });

  it("refuses a group that cannot fit one transaction", () => {
    expect(() => planKeyRotationBatches([group("pool", 17, 1)])).toThrow();
  });
});

describe("poolRotationCalls", () => {
  const handoverCalls = calls(4);
  const base = {
    from: OLD as `0x${string}`,
    to: NEW as `0x${string}`,
    poolAddress: POOL as `0x${string}`,
    handoverCalls,
  } as const;

  it("moves a creator's fee address before SwapPool changes owner", () => {
    const result = poolRotationCalls({
      ...base,
      feeAddress: getAddress(OLD),
      sealState: POOL_SEAL_FEE,
    });
    expect(result.feeAddress).toBe("moved");
    expect(result.calls).toHaveLength(5);
    expect(result.calls.slice(1)).toEqual(handoverCalls);
    const first = result.calls[0];
    expect(first?.to).toBe(POOL);
    expect(
      decodeFunctionData({ abi: swapPoolSetFeeAddressAbi, data: first?.data ?? "0x" }).args,
    ).toEqual([getAddress(NEW)]);
  });

  it("reports a sealed fee address instead of reverting the handover", () => {
    const result = poolRotationCalls({
      ...base,
      feeAddress: OLD as `0x${string}`,
      sealState: POOL_SEAL_FEE_ADDRESS,
    });
    expect(result).toEqual({ calls: handoverCalls, feeAddress: "sealed" });
  });

  it("leaves another recipient alone", () => {
    const result = poolRotationCalls({
      ...base,
      feeAddress: "0x2222222222222222222222222222222222222222",
      sealState: 0,
    });
    expect(result).toEqual({ calls: handoverCalls, feeAddress: "unchanged" });
  });
});
