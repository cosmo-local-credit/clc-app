import type { CreditQuote, CreditQuoteRequest } from "@clc/api/features/credit-router/client";
import { ROOT_KEY_HASH } from "@clc/core/features/credit-router/logic";
import { erc20ApproveAbi, swapPoolWithdrawBoundedAbi } from "@clc/core/features/pool-swaps/logic";
import { buildCaliburNonce, computeEIP712Digest } from "@clc/core/features/webauthn/logic";
import { bytesToHex, encodeFunctionData, getAddress } from "viem";

import { CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";

type Address = `0x${string}`;

export const FIXTURE = {
  relayer: getAddress(`0x${"5e".repeat(20)}`),
  attacker: getAddress(`0x${"e7".repeat(20)}`),
  pool1: getAddress(`0x${"b1".repeat(20)}`),
  pool2: getAddress(`0x${"b2".repeat(20)}`),
  voucherA: getAddress(`0x${"c1".repeat(20)}`),
  voucherB: getAddress(`0x${"c2".repeat(20)}`),
  voucherC: getAddress(`0x${"c3".repeat(20)}`),
};

export type FixtureHop = {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minOut: bigint;
  recipient: Address;
  netOut: bigint;
};

/**
 * A two-hop exact-output quote for 5 C through B, as the router would answer
 * it, with its digest over the batch it sends. `tamper` edits the hops before
 * the batch is built, as a dishonest server that signs consistently would.
 */
export function creditQuoteFixture({
  wallet,
  keyHash = ROOT_KEY_HASH,
  nowSeconds,
  delegated = true,
  tamper,
}: {
  wallet: Address;
  keyHash?: Address;
  nowSeconds: number;
  delegated?: boolean;
  tamper?: (hops: FixtureHop[]) => FixtureHop[];
}): { request: CreditQuoteRequest; quote: CreditQuote } {
  const request: CreditQuoteRequest = {
    route: [
      { pool: FIXTURE.pool1, tokenIn: FIXTURE.voucherA, tokenOut: FIXTURE.voucherB },
      { pool: FIXTURE.pool2, tokenIn: FIXTURE.voucherB, tokenOut: FIXTURE.voucherC },
    ],
    mode: "exactOutput",
    amount: "5000000",
    recipient: null,
    keyHash,
  };
  const honest: FixtureHop[] = [
    {
      ...request.route[0]!,
      amountIn: 5_002_000n,
      minOut: 5_001_000n,
      recipient: wallet,
      netOut: 5_001_000n,
    },
    {
      ...request.route[1]!,
      amountIn: 5_001_000n,
      minOut: 5_000_000n,
      recipient: wallet,
      netOut: 5_000_000n,
    },
  ];
  const hops = tamper ? tamper(honest) : honest;
  const deadline = BigInt(nowSeconds + 300);
  const calls = hops.flatMap((hop) => [
    approve(hop.tokenIn, hop.pool, 0n),
    approve(hop.tokenIn, hop.pool, hop.amountIn),
    {
      to: hop.pool,
      value: "0",
      data: encodeFunctionData({
        abi: swapPoolWithdrawBoundedAbi,
        functionName: "withdraw",
        args: [hop.tokenOut, hop.tokenIn, hop.amountIn, hop.recipient, hop.minOut, deadline],
      }),
    },
  ]);
  const batch = {
    batchedCall: { calls, revertOnFailure: true },
    nonce: buildCaliburNonce(keyHash, 4n).toString(),
    keyHash,
    executor: FIXTURE.relayer,
    deadline: deadline.toString(),
  };
  const digest = bytesToHex(computeEIP712Digest(batch, wallet, CALIBUR_ADDRESS, CHAIN_ID_BIGINT));
  const quote: CreditQuote = {
    quoteId: digest,
    block: { number: 49254469, hash: `0x${"11".repeat(32)}` },
    expiresAt: nowSeconds + 300,
    mode: "exactOutput",
    amountIn: hops[0]!.amountIn.toString(),
    amountOut: hops.at(-1)!.netOut.toString(),
    minAmountOut: hops.at(-1)!.minOut.toString(),
    recipient: wallet,
    hops: hops.map((hop) => ({
      pool: hop.pool,
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
      amountIn: hop.amountIn.toString(),
      grossOut: (hop.netOut + 1000n).toString(),
      poolFee: "0",
      protocolFee: "1000",
      netOut: hop.netOut.toString(),
      minAmountOut: hop.minOut.toString(),
      feePpm: "0",
      protocolFeePpm: "20000",
    })),
    fees: { feeFreeAmountOut: "5002000", effectiveFeePpm: "400" },
    surplus: { output: "0", bridge: [] },
    batch: { ...batch, digest },
    simulation: { ok: true, gasEstimate: "412000" },
    delegated,
    eoaNonce: "0",
  };
  return { request, quote };
}

function approve(token: Address, spender: Address, amount: bigint) {
  return {
    to: token,
    value: "0",
    data: encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spender, amount],
    }),
  };
}
