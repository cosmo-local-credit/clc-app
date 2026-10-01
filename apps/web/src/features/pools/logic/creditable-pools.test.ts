import type { UserPool } from "@clc/api/features/pools/client";
import { describe, expect, it } from "vite-plus/test";

import {
  chunkPoolCreditVouchers,
  mergePoolCreditCandidates,
  poolCreditInputCapacity,
} from "./creditable-pools";

const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function pool(id: number): UserPool {
  return {
    id: String(id),
    address: `0x${id.toString(16).padStart(40, "0")}`,
  } as UserPool;
}

describe("creditable pool candidate assembly", () => {
  it("chunks voucher filters at the backend limit", () => {
    const vouchers = Array.from({ length: 25 }, (_, index) => ({
      chainId: 100,
      address: `0x${(index + 1).toString(16).padStart(40, "0")}` as const,
    }));

    expect(chunkPoolCreditVouchers(vouchers).map((chunk) => chunk.length)).toEqual([12, 12, 1]);
  });

  it("deduplicates pools and candidate token pairs in newest-first order", () => {
    const result = mergePoolCreditCandidates([
      { pools: [pool(2), pool(1)], tokenAddresses: [TOKEN_A] },
      { pools: [pool(3), pool(2)], tokenAddresses: [TOKEN_A, TOKEN_B] },
    ]);

    expect(result.map((candidate) => candidate.pool.id)).toEqual(["3", "2", "1"]);
    expect(result[1]?.tokenAddresses).toEqual([TOKEN_A, TOKEN_B]);
  });
});

describe("poolCreditInputCapacity", () => {
  it("accepts a positive wallet balance in an uncapped pool", () => {
    expect(
      poolCreditInputCapacity({
        walletBalanceRaw: "5",
        poolBalanceRaw: null,
        registryAddress: null,
        registryAllowed: null,
        limiterAddress: null,
        limitRaw: null,
      }),
    ).toEqual({ creditable: true, verificationGap: false });
  });

  it("requires positive room under a configured limiter", () => {
    const common = {
      walletBalanceRaw: "25",
      registryAddress: null,
      registryAllowed: null,
      limiterAddress: "0x1111111111111111111111111111111111111111",
    };

    expect(poolCreditInputCapacity({ ...common, poolBalanceRaw: "75", limitRaw: "100" })).toEqual({
      creditable: true,
      verificationGap: false,
    });
    expect(poolCreditInputCapacity({ ...common, poolBalanceRaw: "100", limitRaw: "100" })).toEqual({
      creditable: false,
      verificationGap: false,
    });
    expect(poolCreditInputCapacity({ ...common, poolBalanceRaw: "125", limitRaw: "100" })).toEqual({
      creditable: false,
      verificationGap: false,
    });
  });

  it("rejects a zero wallet balance and a registry denial", () => {
    expect(
      poolCreditInputCapacity({
        walletBalanceRaw: "0",
        poolBalanceRaw: null,
        registryAddress: null,
        registryAllowed: null,
        limiterAddress: null,
        limitRaw: null,
      }).creditable,
    ).toBe(false);
    expect(
      poolCreditInputCapacity({
        walletBalanceRaw: "5",
        poolBalanceRaw: null,
        registryAddress: "0x2222222222222222222222222222222222222222",
        registryAllowed: false,
        limiterAddress: null,
        limitRaw: null,
      }),
    ).toEqual({ creditable: false, verificationGap: false });
  });

  it("marks unreadable required values as verification gaps", () => {
    expect(
      poolCreditInputCapacity({
        walletBalanceRaw: null,
        poolBalanceRaw: "0",
        registryAddress: null,
        registryAllowed: null,
        limiterAddress: null,
        limitRaw: null,
      }).verificationGap,
    ).toBe(true);
    expect(
      poolCreditInputCapacity({
        walletBalanceRaw: "5",
        poolBalanceRaw: "0",
        registryAddress: "0x2222222222222222222222222222222222222222",
        registryAllowed: null,
        limiterAddress: null,
        limitRaw: null,
      }).verificationGap,
    ).toBe(true);
    expect(
      poolCreditInputCapacity({
        walletBalanceRaw: "5",
        poolBalanceRaw: null,
        registryAddress: null,
        registryAllowed: null,
        limiterAddress: "0x1111111111111111111111111111111111111111",
        limitRaw: "100",
      }).verificationGap,
    ).toBe(true);
  });
});
