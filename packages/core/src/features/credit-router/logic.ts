import {
  bytesToHex,
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
  isAddress,
  zeroAddress,
} from "viem";

import { erc20ApproveAbi, swapPoolWithdrawBoundedAbi } from "../pool-swaps/logic";
import { formatTokenAmountFixed } from "../wallet/logic";
import { type CaliburCall, computeEIP712Digest, type SignedBatch } from "../webauthn/logic";

type Address = `0x${string}`;

/** The most hops the product offers (the router engine is depth-generic). */
export const CREDIT_ROUTER_MAX_HOPS = 2;

/**
 * How far ahead a signed route may expire. The router quotes now + 300 s and
 * the relay accepts up to an hour; anything past this horizon is refused, so a
 * signature cannot be held back and relayed long after the user saw the terms.
 */
export const CREDIT_QUOTE_DEADLINE_HORIZON_SECONDS = 900;

export type CreditQuoteMode = "exactInput" | "exactOutput";

/** One hop as the app names it in a quote request. */
export type CreditRouteHopRef = {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
};

/** Why a route cannot be sent to the quote endpoint, before any request. */
export type CreditRouteProblem = "empty" | "too_long" | "not_contiguous" | "repeats";

/**
 * A quote request route must be contiguous, use distinct pools and distinct
 * vouchers, and have at most `CREDIT_ROUTER_MAX_HOPS` hops — the rules the
 * endpoint enforces, checked here so a malformed route never leaves the app.
 */
export function creditRouteProblem(route: readonly CreditRouteHopRef[]): CreditRouteProblem | null {
  if (route.length === 0) return "empty";
  if (route.length > CREDIT_ROUTER_MAX_HOPS) return "too_long";
  const pools = new Set<string>();
  const vouchers = new Set<string>([route[0]!.tokenIn.toLowerCase()]);
  for (let index = 0; index < route.length; index += 1) {
    const hop = route[index]!;
    if (index > 0 && !sameAddress(route[index - 1]!.tokenOut, hop.tokenIn)) {
      return "not_contiguous";
    }
    const pool = hop.pool.toLowerCase();
    const out = hop.tokenOut.toLowerCase();
    if (pools.has(pool) || vouchers.has(out)) return "repeats";
    pools.add(pool);
    vouchers.add(out);
  }
  return null;
}

/** The request the app sent to `POST /users/me/credit/quote`. */
export type CreditQuoteRequestSent = {
  route: readonly CreditRouteHopRef[];
  mode: CreditQuoteMode;
  /** Raw units: the input spent (exactInput) or the output wanted (exactOutput). */
  amount: string;
  /** Null pays the wallet. */
  recipient: Address | null;
  /** The signing key: all zeros for the Sign-in Card, the passkey's key hash otherwise. */
  keyHash: Hex;
};

/** What the review screen showed and the user confirmed, in raw units. */
export type CreditReviewTerms = {
  amountIn: string;
  minAmountOut: string;
};

/** The parts of a quote response the checks read. */
export type CreditQuoteForVerification = {
  quoteId: Hex;
  mode: CreditQuoteMode;
  hops: readonly {
    pool: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: string;
  }[];
  batch: {
    batchedCall: { calls: readonly CaliburCall[]; revertOnFailure: boolean };
    nonce: string;
    keyHash: Hex;
    executor: Address;
    deadline: string;
    digest: Hex;
  };
};

export type VerifyCreditQuoteInput = {
  request: CreditQuoteRequestSent;
  reviewed: CreditReviewTerms;
  quote: CreditQuoteForVerification;
  /** The session wallet: the EIP-712 verifying contract and every intermediate recipient. */
  wallet: Address;
  /** From the app's own build configuration, never from the response. */
  chainId: bigint;
  caliburAddress: Address;
  /** The executor the app already knows from `/relayer/health`. */
  relayerAddress: Address;
  nowSeconds: number;
  horizonSeconds?: number;
};

/**
 * One row of the pre-signing table (ROUTER.md §7.2), plus the two the table
 * implies: the signing key, and that hop one guarantees what hop two spends.
 */
export type CreditQuoteCheck =
  | "domain"
  | "signer"
  | "route"
  | "first_input"
  | "final_minimum"
  | "final_recipient"
  | "intermediate_recipient"
  | "intermediate_minimum"
  | "approval"
  | "batch_shape"
  | "deadline"
  | "executor";

export type CreditQuoteVerification =
  | {
      ok: true;
      /** The EIP-712 digest the app computed itself. This, not the server's, is signed. */
      digest: Hex;
      signedBatch: SignedBatch;
    }
  | { ok: false; check: CreditQuoteCheck; hop: number | null; detail: string };

type DecodedHop = {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  recipient: Address;
  minAmountOut: bigint;
  deadline: bigint;
};

const KEY_MASK = (1n << 192n) - 1n;

/**
 * Checks a quote's signable batch against what the app sent and what the user
 * confirmed, then computes the EIP-712 digest itself.
 *
 * Comparing the batch with the response's own description of it would only
 * prove the response is self-consistent, so every expectation comes from the
 * request, the review screen or the app's configuration. The calldata is
 * decoded and must re-encode byte for byte, so no padding or trailing bytes
 * slip past the decoder.
 *
 * The domain is checked last: a dishonest server signs its own tampered batch
 * consistently, and the row that the tampering breaks is the useful answer.
 */
export function verifyCreditQuote(input: VerifyCreditQuoteInput): CreditQuoteVerification {
  const { request, reviewed, quote, wallet } = input;
  const horizon = BigInt(input.horizonSeconds ?? CREDIT_QUOTE_DEADLINE_HORIZON_SECONDS);
  const route = request.route;
  const hopCount = route.length;

  if (creditRouteProblem(route) !== null) {
    return refuse("route", null, "the requested route is not a valid route");
  }
  if (quote.mode !== request.mode) {
    return refuse("route", null, "the quote is for another mode");
  }
  if (quote.hops.length !== hopCount) {
    return refuse("route", null, "the quote has a different number of hops");
  }
  for (let index = 0; index < hopCount; index += 1) {
    const shown = quote.hops[index]!;
    const sent = route[index]!;
    if (
      !sameAddress(shown.pool, sent.pool) ||
      !sameAddress(shown.tokenIn, sent.tokenIn) ||
      !sameAddress(shown.tokenOut, sent.tokenOut)
    ) {
      return refuse("route", index, "the quote shows a different pool or voucher");
    }
  }

  const { batchedCall } = quote.batch;
  const calls = batchedCall.calls;
  if (batchedCall.revertOnFailure !== true) {
    return refuse("batch_shape", null, "the batch does not revert on failure");
  }
  if (calls.length !== hopCount * 3) {
    return refuse("batch_shape", null, `expected ${hopCount * 3} calls, got ${calls.length}`);
  }
  for (const [index, call] of calls.entries()) {
    if (parseRaw(call.value) !== 0n) {
      return refuse("batch_shape", Math.floor(index / 3), "a call sends value");
    }
    if (!isAddress(call.to, { strict: false })) {
      return refuse("batch_shape", Math.floor(index / 3), "a call has no valid target");
    }
  }

  const decoded: DecodedHop[] = [];
  for (let index = 0; index < hopCount; index += 1) {
    const sent = route[index]!;
    const reset = decodeApprove(calls[index * 3]!);
    const approval = decodeApprove(calls[index * 3 + 1]!);
    const withdraw = decodeBoundedWithdraw(calls[index * 3 + 2]!);
    if (!reset || !approval || !withdraw) {
      return refuse("batch_shape", index, "a hop is not approve, approve, bounded withdraw");
    }
    if (
      !sameAddress(withdraw.pool, sent.pool) ||
      !sameAddress(withdraw.tokenIn, sent.tokenIn) ||
      !sameAddress(withdraw.tokenOut, sent.tokenOut)
    ) {
      return refuse("route", index, "the withdrawal names a different pool or voucher");
    }
    if (
      !sameAddress(reset.token, sent.tokenIn) ||
      !sameAddress(reset.spender, sent.pool) ||
      reset.amount !== 0n
    ) {
      return refuse("approval", index, "the first approval is not a reset to zero for this pool");
    }
    if (
      !sameAddress(approval.token, sent.tokenIn) ||
      !sameAddress(approval.spender, sent.pool) ||
      approval.amount !== withdraw.amountIn
    ) {
      return refuse("approval", index, "the approval is not this hop's input to this pool");
    }
    if (withdraw.amountIn <= 0n) {
      return refuse("batch_shape", index, "a hop spends nothing");
    }
    if (parseRaw(quote.hops[index]!.amountIn) !== withdraw.amountIn) {
      return refuse(
        index === 0 ? "first_input" : "intermediate_minimum",
        index,
        "the batch spends a different amount than the quote shows",
      );
    }
    decoded.push(withdraw);
  }

  const first = decoded[0]!;
  const last = decoded[hopCount - 1]!;
  const requested = parseRaw(request.amount);
  const reviewedIn = parseRaw(reviewed.amountIn);
  const reviewedMin = parseRaw(reviewed.minAmountOut);
  if (requested === null || requested <= 0n || reviewedIn === null || reviewedMin === null) {
    return refuse("first_input", null, "the requested or reviewed amounts are not raw integers");
  }

  if (request.mode === "exactInput") {
    if (first.amountIn !== requested || reviewedIn !== requested) {
      return refuse("first_input", 0, "the batch spends more or less than requested");
    }
    if (reviewedMin <= 0n || last.minAmountOut !== reviewedMin) {
      return refuse("final_minimum", hopCount - 1, "the minimum is not the one reviewed");
    }
  } else {
    if (first.amountIn !== reviewedIn) {
      return refuse("first_input", 0, "the batch spends a different amount than reviewed");
    }
    if (last.minAmountOut !== requested || reviewedMin !== requested) {
      return refuse("final_minimum", hopCount - 1, "the minimum is not the requested quantity");
    }
  }

  for (let index = 0; index < hopCount - 1; index += 1) {
    const hop = decoded[index]!;
    if (!sameAddress(hop.recipient, wallet)) {
      return refuse("intermediate_recipient", index, "an intermediate hop pays someone else");
    }
    if (hop.minAmountOut < decoded[index + 1]!.amountIn) {
      return refuse(
        "intermediate_minimum",
        index,
        "hop one does not guarantee what hop two spends, so it could spend held vouchers",
      );
    }
  }
  const recipient = request.recipient ?? wallet;
  if (!sameAddress(last.recipient, recipient) || sameAddress(last.recipient, zeroAddress)) {
    return refuse("final_recipient", hopCount - 1, "the output goes to someone else");
  }

  const now = BigInt(Math.floor(input.nowSeconds));
  const deadline = parseRaw(quote.batch.deadline);
  if (deadline === null || deadline <= now || deadline > now + horizon) {
    return refuse("deadline", null, "the deadline is expired or beyond the horizon");
  }
  for (const [index, hop] of decoded.entries()) {
    if (hop.deadline !== deadline) {
      return refuse("deadline", index, "a withdrawal has its own deadline");
    }
  }

  if (!sameAddress(quote.batch.executor, input.relayerAddress)) {
    return refuse("executor", null, "the executor is not the relayer");
  }

  const nonce = parseRaw(quote.batch.nonce);
  if (
    !sameHex(quote.batch.keyHash, request.keyHash) ||
    nonce === null ||
    nonce >> 64n !== (BigInt(request.keyHash) & KEY_MASK)
  ) {
    return refuse("signer", null, "the batch is for another signing key");
  }

  const signedBatch: SignedBatch = {
    batchedCall: { calls: calls.map((call) => ({ ...call })), revertOnFailure: true },
    nonce: nonce.toString(),
    keyHash: quote.batch.keyHash,
    executor: quote.batch.executor,
    deadline: deadline.toString(),
  };
  const digest = bytesToHex(
    computeEIP712Digest(signedBatch, wallet, input.caliburAddress, input.chainId),
  );
  if (!sameHex(digest, quote.batch.digest) || !sameHex(digest, quote.quoteId)) {
    return refuse(
      "domain",
      null,
      "the server's digest is not for this chain, wallet and Calibur deployment",
    );
  }
  return { ok: true, digest, signedBatch };
}

function refuse(
  check: CreditQuoteCheck,
  hop: number | null,
  detail: string,
): CreditQuoteVerification {
  return { ok: false, check, hop, detail };
}

function decodeApprove(
  call: CaliburCall,
): { token: Address; spender: Address; amount: bigint } | null {
  try {
    const { args } = decodeFunctionData({ abi: erc20ApproveAbi, data: call.data });
    const [spender, amount] = args;
    const canonical = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spender, amount],
    });
    if (canonical.toLowerCase() !== call.data.toLowerCase()) return null;
    return { token: call.to, spender, amount };
  } catch {
    return null;
  }
}

function decodeBoundedWithdraw(call: CaliburCall): DecodedHop | null {
  try {
    const { args } = decodeFunctionData({ abi: swapPoolWithdrawBoundedAbi, data: call.data });
    const canonical = encodeFunctionData({
      abi: swapPoolWithdrawBoundedAbi,
      functionName: "withdraw",
      args,
    });
    if (canonical.toLowerCase() !== call.data.toLowerCase()) return null;
    const [tokenOut, tokenIn, amountIn, recipient, minAmountOut, deadline] = args;
    return { pool: call.to, tokenIn, tokenOut, amountIn, recipient, minAmountOut, deadline };
  } catch {
    return null;
  }
}

function parseRaw(value: string): bigint | null {
  return /^\d+$/.test(value) ? BigInt(value) : null;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameHex(left: string, right: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(left) && left.toLowerCase() === right.toLowerCase();
}

/** The zero key hash the Sign-in Card's root key signs under. */
export const ROOT_KEY_HASH: Hex = `0x${"00".repeat(32)}`;

/**
 * An effective fee in ppm as a percentage with two places. A positive fee
 * under the display boundary reads "<0.01%" rather than 0.00%.
 */
export function formatFeePpm(ppm: string, locale?: string): string | null {
  const value = parseRaw(ppm);
  if (value === null || value > 1_000_000n) return null;
  if (value > 0n && value < 100n) return `<${formatTokenAmountFixed("1", 2, 2, locale)}%`;
  return `${formatTokenAmountFixed(value.toString(), 4, 2, locale)}%`;
}

/**
 * "1 input = n output" for a rate given as raw amounts. Null when the rate
 * is unknown or degenerate.
 */
export function formatCreditRate(input: {
  amountIn: string;
  amountOut: string;
  decimalsIn: number;
  decimalsOut: number;
  locale?: string;
}): string | null {
  const amountIn = parseRaw(input.amountIn);
  const amountOut = parseRaw(input.amountOut);
  if (amountIn === null || amountOut === null || amountIn === 0n) return null;
  const perUnit = (amountOut * 10n ** BigInt(input.decimalsIn)) / amountIn;
  return formatTokenAmountFixed(perUnit.toString(), input.decimalsOut, 2, input.locale);
}
