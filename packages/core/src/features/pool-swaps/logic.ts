import { encodeFunctionData, isAddress, parseAbi, zeroAddress } from "viem";
import type { CaliburCall } from "../webauthn/index";

export const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
]);
export const erc20AllowanceAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
]);
export const erc20BalanceOfAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);
export const erc20SymbolAbi = parseAbi(["function symbol() view returns (string)"]);
export const erc20NameAbi = parseAbi(["function name() view returns (string)"]);
export const erc20DecimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);

export const swapPoolDepositAbi = parseAbi(["function deposit(address token, uint256 value)"]);
export const swapPoolWithdrawToSenderAbi = parseAbi([
  "function withdraw(address outToken, address inToken, uint256 value)",
]);
export const swapPoolWithdrawToRecipientAbi = parseAbi([
  "function withdraw(address outToken, address inToken, uint256 value, address recipient)",
]);
export const swapPoolWithdrawAllFeesAbi = parseAbi(["function withdraw(address outToken)"]);
export const swapPoolWithdrawExactFeesAbi = parseAbi([
  "function withdraw(address outToken, uint256 value)",
]);
export const swapPoolGetAmountOutAbi = parseAbi([
  "function getAmountOut(address outToken, address inToken, uint256 amountIn) returns (uint256)",
]);
export const swapPoolGetAmountInAbi = parseAbi([
  "function getAmountIn(address outToken, address inToken, uint256 amountOut) returns (uint256)",
]);
export const swapPoolGetQuoteAbi = parseAbi([
  "function getQuote(address outToken, address inToken, uint256 amount) returns (uint256)",
]);
export const poolQuoterReverseValueForAbi = parseAbi([
  "function reverseValueFor(address outToken, address inToken, uint256 value) returns (uint256)",
]);
export const swapPoolGetFeeAbi = parseAbi([
  "function getFee(address inToken, address outToken, uint256 value) view returns (uint256)",
]);
export const swapPoolFeesAbi = parseAbi(["function fees(address token) view returns (uint256)"]);
export const swapPoolFeesDecoupledAbi = parseAbi(["function feesDecoupled() view returns (bool)"]);
export const swapRouterQuoteExactInputAbi = parseAbi([
  "struct Hop { address pool; address tokenIn; address tokenOut }",
  "function quoteExactInput(Hop[] path, uint256 amountIn) returns (uint256)",
]);
export const swapRouterQuoteExactOutputAbi = parseAbi([
  "struct Hop { address pool; address tokenIn; address tokenOut }",
  "function quoteExactOutput(Hop[] path, uint256 amountOut) returns (uint256)",
]);

/**
 * What the pool can actually pay out of a voucher.
 *
 * Under decoupled fees the pool holds its accrued fees in the same balance but
 * `_swap` reserves them, so the whole balance is not liquidity — quoting against
 * it promises an amount the swap reverts `InsufficientBalance` on. Coupled fees
 * stay part of liquidity, which is what the contract itself checks.
 *
 * Both arguments are raw on-chain integers; a malformed one is read as zero
 * rather than throwing, because every caller is a display path that would
 * otherwise take a whole picker down with it.
 */
export function poolAvailableLiquidityRaw(input: {
  balanceRaw: string;
  feesRaw: string;
  feesDecoupled: boolean;
}): string {
  let balance: bigint;
  let fees: bigint;
  try {
    balance = BigInt(input.balanceRaw);
    fees = BigInt(input.feesRaw);
  } catch {
    return "0";
  }
  if (!input.feesDecoupled) return balance.toString();
  return (balance > fees ? balance - fees : 0n).toString();
}

/**
 * `SwapPool`'s fee denominator. `getFee(inToken, outToken, POOL_FEE_PPM)` therefore
 * returns the pair's pool fee rate itself, in ppm.
 */
export const POOL_FEE_PPM = 1_000_000n;

/**
 * Splits what a single-pool swap takes out of its output into the pool's fee and
 * the protocol's, exactly as `SwapPool._swap` computes them.
 *
 * The pool fee is the FeePolicy rate on the gross quote, floored, and is credited
 * to the pool. The protocol fee is the controller's cut of the larger of that fee
 * and a 1% floor, so a pool charging nothing still pays one — which is why a
 * single "fees" figure read as wrong. It is not recomputed here: the contract
 * subtracts both from the gross, so it is whatever the gross loses beyond the
 * pool fee, and the controller never has to be read.
 *
 * All inputs are raw on-chain integers. Null when they cannot be the output of
 * one swap — malformed, or a net above the gross — rather than a negative fee.
 */
export function splitPoolSwapFees(input: {
  grossAmountOutRaw: string;
  netAmountOutRaw: string;
  poolFeePpm: string;
}): { poolFeeRaw: string; protocolFeeRaw: string } | null {
  let gross: bigint;
  let net: bigint;
  let feePpm: bigint;
  try {
    gross = BigInt(input.grossAmountOutRaw);
    net = BigInt(input.netAmountOutRaw);
    feePpm = BigInt(input.poolFeePpm);
  } catch {
    return null;
  }
  if (gross < 0n || net < 0n || feePpm < 0n || net > gross) return null;
  const poolFee = (gross * feePpm) / POOL_FEE_PPM;
  const protocolFee = gross - net - poolFee;
  if (protocolFee < 0n) return null;
  return { poolFeeRaw: poolFee.toString(), protocolFeeRaw: protocolFee.toString() };
}

/** The holder/cap ceiling before output-token liquidity is considered. */
export function poolSwapInputUpperBoundRaw(input: {
  walletBalanceRaw: string;
  depositHeadroomRaw: string | null;
}): string | null {
  return minimumRawAmount(input.walletBalanceRaw, input.depositHeadroomRaw);
}

/**
 * The largest raw input bounded by everything a single-pool swap can exhaust.
 *
 * A null deposit headroom means the pool is uncapped. Callers must withhold this
 * calculation when a limiter exists but its cap could not be read; treating an
 * unknown cap as uncapped would present a Max amount that can revert.
 */
export function poolSwapMaxInputRaw(input: {
  walletBalanceRaw: string;
  depositHeadroomRaw: string | null;
  liquidityInputCeilingRaw: string;
}): string | null {
  const inputUpperBoundRaw = poolSwapInputUpperBoundRaw(input);
  if (inputUpperBoundRaw === null) return null;
  return minimumRawAmount(inputUpperBoundRaw, input.liquidityInputCeilingRaw);
}

function minimumRawAmount(leftRaw: string, rightRaw: string | null): string | null {
  try {
    const left = BigInt(leftRaw);
    if (left < 0n) return null;
    if (rightRaw === null) return left.toString();
    const right = BigInt(rightRaw);
    if (right < 0n) return null;
    return (left < right ? left : right).toString();
  } catch {
    return null;
  }
}

const RELAYER_CALL_LIMIT = 16;

export type BuildPoolDepositCallsInput = {
  poolAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  amountRaw: string;
};

export type BuildPoolWithdrawCallsInput = {
  poolAddress: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountInRaw: string;
  recipientAddress?: `0x${string}`;
};

export type PoolRouteHop = {
  poolAddress: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
};

export type BuildPoolRouteCallsInput = {
  path: PoolRouteHop[];
  hopAmountIns: string[];
  recipientAddress?: `0x${string}`;
};

export type BuildCollectPoolFeesCallsInput = {
  poolAddress: `0x${string}`;
  tokenOut: `0x${string}`;
  amountRaw?: string;
};

export function buildPoolDepositCalls(input: BuildPoolDepositCallsInput): CaliburCall[] {
  const amount = parsePositiveAmount(input.amountRaw);
  const calls = [
    buildApproveCall(input.tokenAddress, input.poolAddress, 0n),
    buildApproveCall(input.tokenAddress, input.poolAddress, amount),
    {
      to: input.poolAddress,
      value: "0",
      data: encodeFunctionData({
        abi: swapPoolDepositAbi,
        functionName: "deposit",
        args: [input.tokenAddress, amount],
      }),
    },
  ];
  assertRelayerCallLimit(calls);
  return calls;
}

export function buildPoolWithdrawCalls(input: BuildPoolWithdrawCallsInput): CaliburCall[] {
  const amount = parsePositiveAmount(input.amountInRaw);
  const calls = [
    buildApproveCall(input.tokenIn, input.poolAddress, 0n),
    buildApproveCall(input.tokenIn, input.poolAddress, amount),
    buildWithdrawCall({
      poolAddress: input.poolAddress,
      tokenOut: input.tokenOut,
      tokenIn: input.tokenIn,
      amountIn: amount,
      recipientAddress: input.recipientAddress,
    }),
  ];
  assertRelayerCallLimit(calls);
  return calls;
}

export function buildPoolRouteCalls(input: BuildPoolRouteCallsInput): CaliburCall[] {
  if (input.path.length === 0) throw new Error("Pool route path must be non-empty.");
  if (input.hopAmountIns.length !== input.path.length) {
    throw new Error("Pool route hop amount length must match path length.");
  }
  if (input.recipientAddress) assertRecipientAddress(input.recipientAddress);

  const calls = input.path.flatMap((hop, index) => {
    const amountIn = parsePositiveAmount(input.hopAmountIns[index] ?? "");
    const isLastHop = index === input.path.length - 1;
    return [
      buildApproveCall(hop.tokenIn, hop.poolAddress, 0n),
      buildApproveCall(hop.tokenIn, hop.poolAddress, amountIn),
      buildWithdrawCall({
        poolAddress: hop.poolAddress,
        tokenOut: hop.tokenOut,
        tokenIn: hop.tokenIn,
        amountIn,
        recipientAddress: isLastHop ? input.recipientAddress : undefined,
      }),
    ];
  });
  assertRelayerCallLimit(calls);
  return calls;
}

export function buildCollectPoolFeesCalls(input: BuildCollectPoolFeesCallsInput): CaliburCall[] {
  if (input.amountRaw === undefined) {
    return [
      {
        to: input.poolAddress,
        value: "0",
        data: encodeFunctionData({
          abi: swapPoolWithdrawAllFeesAbi,
          functionName: "withdraw",
          args: [input.tokenOut],
        }),
      },
    ];
  }

  const amount = parsePositiveAmount(input.amountRaw);
  return [
    {
      to: input.poolAddress,
      value: "0",
      data: encodeFunctionData({
        abi: swapPoolWithdrawExactFeesAbi,
        functionName: "withdraw",
        args: [input.tokenOut, amount],
      }),
    },
  ];
}

function buildApproveCall(
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint,
): CaliburCall {
  return {
    to: tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spenderAddress, amount],
    }),
  };
}

function buildWithdrawCall(input: {
  poolAddress: `0x${string}`;
  tokenOut: `0x${string}`;
  tokenIn: `0x${string}`;
  amountIn: bigint;
  recipientAddress?: `0x${string}`;
}): CaliburCall {
  if (!input.recipientAddress) {
    return {
      to: input.poolAddress,
      value: "0",
      data: encodeFunctionData({
        abi: swapPoolWithdrawToSenderAbi,
        functionName: "withdraw",
        args: [input.tokenOut, input.tokenIn, input.amountIn],
      }),
    };
  }

  assertRecipientAddress(input.recipientAddress);
  return {
    to: input.poolAddress,
    value: "0",
    data: encodeFunctionData({
      abi: swapPoolWithdrawToRecipientAbi,
      functionName: "withdraw",
      args: [input.tokenOut, input.tokenIn, input.amountIn, input.recipientAddress],
    }),
  };
}

function parsePositiveAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Pool amount must be a positive integer string.");
  const amount = BigInt(value);
  if (amount <= 0n) throw new Error("Pool amount must be positive.");
  return amount;
}

function assertRecipientAddress(address: `0x${string}`): void {
  if (!isAddress(address) || address.toLowerCase() === zeroAddress) {
    throw new Error("Pool swap recipient must be a non-zero address.");
  }
}

function assertRelayerCallLimit(calls: CaliburCall[]): void {
  if (calls.length > RELAYER_CALL_LIMIT) {
    throw new Error(`Pool relay batch cannot exceed ${RELAYER_CALL_LIMIT} calls.`);
  }
}
