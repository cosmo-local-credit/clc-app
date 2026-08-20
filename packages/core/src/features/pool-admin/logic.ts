import { encodeFunctionData, isAddress, parseAbi, zeroAddress } from "viem";
import type { CaliburCall } from "../webauthn/index";

/**
 * The steward-side pool calls: putting a voucher into a pool and configuring how
 * that pool treats it.
 *
 * Separate from `pool-swaps/logic` on purpose. That module is what a holder does
 * with a pool — deposit, swap, collect. This one is what an owner does *to* a
 * pool, and every call here lands on a different contract than SwapPool itself:
 * membership is the token registry's, the deposit cap is the limiter's, and the
 * price is the quoter's. SwapPool only holds the pointers.
 *
 * Pure: builds calldata and validates it, signs nothing. The signature and the
 * relay belong to whichever app is holding a key.
 */

export const tokenIndexAddAbi = parseAbi(["function add(address token) returns (bool)"]);

export const limiterSetLimitForAbi = parseAbi([
  "function setLimitFor(address token, address holder, uint256 value)",
]);

/**
 * OracleQuoter overloads `setOracle`, so each arity needs its own ABI —
 * `encodeFunctionData` cannot pick between two entries of the same name.
 */
export const oracleQuoterSetOracleAbi = parseAbi([
  "function setOracle(address token, address oracle)",
]);
export const oracleQuoterSetOracleWithStalenessAbi = parseAbi([
  "function setOracle(address token, address oracle, uint256 maxStaleness)",
]);

/**
 * How the pool's quoter should price the new voucher.
 *
 * One variant per quoter this product publishes, because the two take different
 * calls and are not interchangeable: an OracleQuoter maps the token to a
 * Chainlink aggregator, while a DecimalQuoter derives everything from token
 * decimals and has no per-token configuration at all.
 *
 * RelativeQuoter has no variant. It is not offered for new pools, and a pool
 * already running one cannot be configured from here — `setPriceIndexValue`
 * takes a manually maintained rate that nothing in this product tracks, so the
 * caller refuses the pool rather than writing a number nobody chose.
 */
export type PoolVoucherPricing =
  | {
      kind: "oracle";
      aggregatorAddress: `0x${string}`;
      /**
       * Per-feed freshness bound in seconds. Omitted leaves the quoter's global
       * `maxStaleness` in force, which is what the two-argument overload means.
       */
      maxStalenessSeconds?: string;
    }
  | { kind: "decimal" };

export type BuildAddPoolVoucherCallsInput = {
  poolAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  registryAddress: `0x${string}` | null;
  limiterAddress: `0x${string}` | null;
  quoterAddress: `0x${string}` | null;
  /**
   * Whether to register the token.
   *
   * `TokenUniqueSymbolIndex.add` reverts with `TokenAlreadyExists` on a token the
   * registry already holds, and the batch is relayed with `revertOnFailure`, so
   * including this call while re-configuring an existing member would throw away
   * the cap and price changes with it.
   */
  register: boolean;
  /** Deposit cap in raw base units. Omitted leaves the limiter untouched. */
  depositCapRaw?: string;
  pricing: PoolVoucherPricing;
};

/**
 * The calls that make a voucher usable in a pool, in the order they must run.
 *
 * Registry first: `SwapPool.deposit` checks membership before the limit, so a
 * cap set against an unregistered token is a cap nothing can reach. Pricing
 * last, because it is the only step a pool may legitimately not need — a
 * DecimalQuoter prices every pair from decimals alone.
 *
 * Returned as one batch on purpose. The three calls are separately owned
 * contracts but a single operator decision, and relaying them together means a
 * voucher is never left registered but unpriced, quoting a revert to anyone who
 * tries to swap it.
 */
export function buildAddPoolVoucherCalls(input: BuildAddPoolVoucherCallsInput): CaliburCall[] {
  assertContractAddress(input.poolAddress, "pool");
  assertContractAddress(input.tokenAddress, "voucher");

  const calls: CaliburCall[] = [];

  if (input.register) {
    const registry = requireDependency(input.registryAddress, "token registry");
    calls.push({
      to: registry,
      value: "0",
      data: encodeFunctionData({
        abi: tokenIndexAddAbi,
        functionName: "add",
        args: [input.tokenAddress],
      }),
    });
  }

  if (input.depositCapRaw !== undefined) {
    const limiter = requireDependency(input.limiterAddress, "limiter");
    calls.push({
      to: limiter,
      value: "0",
      data: encodeFunctionData({
        abi: limiterSetLimitForAbi,
        functionName: "setLimitFor",
        // The holder is the pool: the limiter caps what any one holder may hold
        // of a token, and `mustWithinLimit` reads `limitOf(token, address(this))`.
        args: [input.tokenAddress, input.poolAddress, parsePositiveAmount(input.depositCapRaw)],
      }),
    });
  }

  const pricingCall = buildPricingCall(input);
  if (pricingCall) calls.push(pricingCall);

  if (calls.length === 0) {
    throw new Error("Adding a voucher needs at least one of registration, a cap, or a price.");
  }
  return calls;
}

function buildPricingCall(input: BuildAddPoolVoucherCallsInput): CaliburCall | null {
  if (input.pricing.kind === "decimal") return null;

  const quoter = requireDependency(input.quoterAddress, "quoter");

  const { aggregatorAddress, maxStalenessSeconds } = input.pricing;
  assertContractAddress(aggregatorAddress, "aggregator");

  if (maxStalenessSeconds === undefined) {
    return {
      to: quoter,
      value: "0",
      data: encodeFunctionData({
        abi: oracleQuoterSetOracleAbi,
        functionName: "setOracle",
        args: [input.tokenAddress, aggregatorAddress],
      }),
    };
  }

  return {
    to: quoter,
    value: "0",
    data: encodeFunctionData({
      abi: oracleQuoterSetOracleWithStalenessAbi,
      functionName: "setOracle",
      args: [input.tokenAddress, aggregatorAddress, parsePositiveAmount(maxStalenessSeconds)],
    }),
  };
}

function parsePositiveAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Pool value must be a positive integer string.");
  const amount = BigInt(value);
  // Zero is a real setting on both contracts and means the opposite of unset: a
  // zero cap rejects every deposit, and a zero rate prices the token at nothing.
  // Neither belongs in a flow whose purpose is to make a voucher usable.
  if (amount <= 0n) throw new Error("Pool value must be greater than zero.");
  return amount;
}

function assertContractAddress(address: `0x${string}`, label: string): void {
  if (!isAddress(address) || address.toLowerCase() === zeroAddress) {
    throw new Error(`Pool ${label} must be a non-zero address.`);
  }
}

function requireDependency(address: `0x${string}` | null, label: string): `0x${string}` {
  if (!address) throw new Error(`This pool has no ${label} address on record.`);
  assertContractAddress(address, label);
  return address;
}
