import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vite-plus/test";
import {
  buildCollectPoolFeesCalls,
  buildPoolDepositCalls,
  buildPoolRouteCalls,
  buildPoolWithdrawCalls,
  erc20ApproveAbi,
  swapPoolDepositAbi,
  swapPoolWithdrawAllFeesAbi,
  swapPoolWithdrawExactFeesAbi,
  swapPoolWithdrawToRecipientAbi,
  swapPoolWithdrawToSenderAbi,
} from "./logic";

const POOL = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_IN = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_OUT = "0x3333333333333333333333333333333333333333" as const;
const TOKEN_MID = "0x4444444444444444444444444444444444444444" as const;
const POOL_2 = "0x5555555555555555555555555555555555555555" as const;
const RECIPIENT = "0x6666666666666666666666666666666666666666" as const;

function decodeApprove(data: `0x${string}`) {
  return decodeFunctionData({ abi: erc20ApproveAbi, data });
}

describe("pool swap call builders", () => {
  it("encodes a liquidity deposit as approve zero, approve amount, then deposit", () => {
    const calls = buildPoolDepositCalls({
      poolAddress: POOL,
      tokenAddress: TOKEN_IN,
      amountRaw: "1000",
    });

    expect(calls).toHaveLength(3);
    expect(calls.map((call) => ({ to: call.to, value: call.value }))).toEqual([
      { to: TOKEN_IN, value: "0" },
      { to: TOKEN_IN, value: "0" },
      { to: POOL, value: "0" },
    ]);
    expect(decodeApprove(calls[0].data).args).toEqual([POOL, 0n]);
    expect(decodeApprove(calls[1].data).args).toEqual([POOL, 1000n]);
    expect(decodeFunctionData({ abi: swapPoolDepositAbi, data: calls[2].data }).args).toEqual([
      TOKEN_IN,
      1000n,
    ]);
  });

  it("encodes a sender swap with the 3-argument withdraw overload", () => {
    const calls = buildPoolWithdrawCalls({
      poolAddress: POOL,
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      amountInRaw: "2500",
    });

    expect(calls).toHaveLength(3);
    expect(decodeApprove(calls[0].data).args).toEqual([POOL, 0n]);
    expect(decodeApprove(calls[1].data).args).toEqual([POOL, 2500n]);
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawToSenderAbi, data: calls[2].data }).args,
    ).toEqual([TOKEN_OUT, TOKEN_IN, 2500n]);
  });

  it("encodes a recipient swap with the 4-argument withdraw overload", () => {
    const calls = buildPoolWithdrawCalls({
      poolAddress: POOL,
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      amountInRaw: "2500",
      recipientAddress: RECIPIENT,
    });

    expect(calls).toHaveLength(3);
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawToRecipientAbi, data: calls[2].data }).args,
    ).toEqual([TOKEN_OUT, TOKEN_IN, 2500n, RECIPIENT]);
  });

  it("rejects invalid route shapes and batches over the relayer call limit", () => {
    expect(() => buildPoolRouteCalls({ path: [], hopAmountIns: [] })).toThrow(/non-empty/i);
    expect(() =>
      buildPoolRouteCalls({
        path: [{ poolAddress: POOL, tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT }],
        hopAmountIns: [],
      }),
    ).toThrow(/length/i);
    expect(() =>
      buildPoolRouteCalls({
        path: [{ poolAddress: POOL, tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT }],
        hopAmountIns: ["0"],
      }),
    ).toThrow(/positive/i);
    expect(() =>
      buildPoolRouteCalls({
        path: Array.from({ length: 6 }, () => ({
          poolAddress: POOL,
          tokenIn: TOKEN_IN,
          tokenOut: TOKEN_OUT,
        })),
        hopAmountIns: ["1", "1", "1", "1", "1", "1"],
      }),
    ).toThrow(/16/);
  });

  it("uses the recipient overload only for the final route hop", () => {
    const calls = buildPoolRouteCalls({
      path: [
        { poolAddress: POOL, tokenIn: TOKEN_IN, tokenOut: TOKEN_MID },
        { poolAddress: POOL_2, tokenIn: TOKEN_MID, tokenOut: TOKEN_OUT },
      ],
      hopAmountIns: ["100", "95"],
      recipientAddress: RECIPIENT,
    });

    expect(calls).toHaveLength(6);
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawToSenderAbi, data: calls[2].data }).args,
    ).toEqual([TOKEN_MID, TOKEN_IN, 100n]);
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawToRecipientAbi, data: calls[5].data }).args,
    ).toEqual([TOKEN_OUT, TOKEN_MID, 95n, RECIPIENT]);
  });

  it("encodes both owner-only fee collection overloads", () => {
    const allFees = buildCollectPoolFeesCalls({ poolAddress: POOL, tokenOut: TOKEN_OUT });
    const exactFees = buildCollectPoolFeesCalls({
      poolAddress: POOL,
      tokenOut: TOKEN_OUT,
      amountRaw: "77",
    });

    expect(allFees).toHaveLength(1);
    expect(exactFees).toHaveLength(1);
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawAllFeesAbi, data: allFees[0].data }).args,
    ).toEqual([TOKEN_OUT]);
    expect(
      decodeFunctionData({ abi: swapPoolWithdrawExactFeesAbi, data: exactFees[0].data }).args,
    ).toEqual([TOKEN_OUT, 77n]);
  });
});
