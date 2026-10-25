import { encodeFunctionData, isAddress, parseAbi, zeroAddress } from "viem";
import { z } from "zod";
import { formatTokenAmount, parseTokenAmount } from "../wallet/logic";
import type { CaliburCall } from "../webauthn/index";

/**
 * The steward-side pool calls: putting a voucher into a pool and configuring how
 * that pool treats it.
 *
 * Separate from `pool-swaps/logic` on purpose. That module is what a holder does
 * with a pool — deposit, swap, collect. This one is what an owner does *to* a
 * pool, and most calls here land on a different contract than SwapPool itself:
 * membership is the token registry's, the deposit cap is the limiter's, and the
 * price is the quoter's. SwapPool only holds the pointers.
 *
 * Pure: builds calldata and validates it, signs nothing. The signature and the
 * relay belong to whichever app is holding a key.
 */

export const tokenIndexAddAbi = parseAbi(["function add(address token) returns (bool)"]);
export const tokenIndexRemoveAbi = parseAbi(["function remove(address token) returns (bool)"]);
/**
 * Membership, read straight from the registry.
 *
 * The authority on whether `add` may be sent. The catalog's pool voucher list is
 * not: it answers for rows clc-core has projected and enriched, so a token
 * seeded at `initialize` — or one the indexer has not caught up with — is
 * registered on chain while absent there. Sending `add` for such a token reverts
 * `TokenAlreadyExists`, and the batch is relayed `revertOnFailure`.
 */
export const tokenIndexHaveAbi = parseAbi(["function have(address token) view returns (bool)"]);
/**
 * Enumeration of the registry, `entry` being zero-based over `entryCount`.
 *
 * Together they are the only complete answer to "which vouchers does this pool
 * admit": every swap and deposit runs `have(token)` against this registry, so
 * the set they list is exactly the set `SwapPool` will accept.
 */
export const tokenIndexEntryCountAbi = parseAbi(["function entryCount() view returns (uint256)"]);
export const tokenIndexEntryAbi = parseAbi([
  "function entry(uint256 index) view returns (address)",
]);

export const limiterSetLimitForAbi = parseAbi([
  "function setLimitFor(address token, address holder, uint256 value)",
]);
/**
 * The cap read back, and the one `SwapPool.mustWithinLimit` actually enforces:
 * `limitOf(token, address(this)) >= balanceOf(this) + value`. The holder is
 * therefore the pool, never the person swapping.
 *
 * Preferred over the catalog's `tokenLimit`, which is the indexer's projection
 * of `LimitSet` and can lag a steward who has just raised the cap — or, for a
 * limiter the indexer never saw configured, be absent entirely.
 */
export const limiterLimitOfAbi = parseAbi([
  "function limitOf(address token, address holder) view returns (uint256)",
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

export const relativeQuoterSetPriceIndexValueAbi = parseAbi([
  "function setPriceIndexValue(address token, uint256 exchangeRate) returns (uint256)",
]);
/**
 * Read-side counterpart, and the one selector that tells the three quoters
 * apart: neither OracleQuoter nor DecimalQuoter exposes `priceIndex`, so a call
 * that returns rather than reverts identifies a RelativeQuoter.
 */
export const relativeQuoterPriceIndexAbi = parseAbi([
  "function priceIndex(address token) view returns (uint256)",
]);

export const swapPoolWithdrawLiquidityAbi = parseAbi([
  "function withdrawLiquidity(address token, address to, uint256 amount)",
]);
export const swapPoolSetFeeAddressAbi = parseAbi(["function setFeeAddress(address feeAddress)"]);
/**
 * The recipient read back from the pool itself.
 *
 * The catalog does not carry it: clc-core records the dependency addresses a
 * deploy created but never `feeAddress`, so every pool reads back "not set"
 * there whatever was configured. The chain is the only place the current value
 * exists, and it is also where a later `setFeeAddress` lands.
 */
export const swapPoolFeeAddressAbi = parseAbi(["function feeAddress() view returns (address)"]);

export const feePolicyDefaultFeeAbi = parseAbi(["function getDefaultFee() view returns (uint256)"]);
export const feePolicySetDefaultFeeAbi = parseAbi(["function setDefaultFee(uint256 defaultFee)"]);

/**
 * FeePolicy stores fees in PPM against a 1,000,000 scale, so a percentage is a
 * decimal with four places: 1% is 10,000 PPM, and 0.0001% is the smallest fee
 * the contract can express.
 */
export const POOL_FEE_PERCENT_DECIMALS = 4;

/** `FeePolicy.PPM` — the contract refuses a default fee above it. */
const POOL_FEE_PPM_MAX = 1_000_000;

/**
 * RelativeQuoter stores rates in PPM, so a rate is a decimal with six places.
 * The quoter reads an unset token as PPM exactly — parity — which is why a rate
 * of zero is refused rather than encoded.
 */
export const POOL_PRICE_INDEX_DECIMALS = 6;

const PRICE_INDEX_SCALE = 10n ** BigInt(POOL_PRICE_INDEX_DECIMALS);

/**
 * How the pool's quoter should price the voucher.
 *
 * One variant per quoter the protocol publishes, because the three take
 * different calls and are not interchangeable: a RelativeQuoter holds a
 * hand-set rate per token, an OracleQuoter maps the token to a Chainlink
 * aggregator, and a DecimalQuoter derives everything from token decimals and
 * has no per-token configuration at all.
 *
 * A caller that adds a fourth quoter adds a variant here and a branch in
 * `buildPricingCall`; nothing else in the batch changes.
 */
export type PoolVoucherPricing =
  | {
      kind: "relative";
      /** The token's value in the pool's unit of account, in PPM. */
      exchangeRatePpm: string;
    }
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

export type RelativePoolVoucherPricing = Extract<PoolVoucherPricing, { kind: "relative" }>;

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
  /**
   * Deposit cap in raw base units. Omitted leaves the limiter untouched.
   *
   * Zero is a value, not an omission: `Limiter.setLimitFor(token, pool, 0)` is
   * how a steward admits a voucher while accepting no deposits of it yet, and
   * the contract takes it. Only `undefined` means "don't write a limit".
   */
  depositCapRaw?: string;
  /** Omitted leaves the quoter untouched, which is what an unchanged rate means. */
  pricing?: PoolVoucherPricing;
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
 * voucher is never left registered but unpriced, quoting a revert — or, on a
 * RelativeQuoter, a parity nobody chose — to anyone who tries to swap it.
 *
 * The same builder covers an edit: pass `register: false` and only the fields
 * that changed.
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
        args: [input.tokenAddress, input.poolAddress, parseAmount(input.depositCapRaw)],
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

/**
 * Takes the voucher out of the pool's registry.
 *
 * One call, and the registry's rather than the pool's: `SwapPool` checks both
 * sides of a swap against `have()`, so de-listing closes entry and exit
 * together. The cap and the rate are left where they are — they address a token
 * the pool no longer admits, and re-registering later should restore the
 * configuration the steward last chose rather than silently start from nothing.
 */
export function buildRemovePoolVoucherCalls(input: {
  tokenAddress: `0x${string}`;
  registryAddress: `0x${string}` | null;
}): CaliburCall[] {
  assertContractAddress(input.tokenAddress, "voucher");
  const registry = requireDependency(input.registryAddress, "token registry");
  return [
    {
      to: registry,
      value: "0",
      data: encodeFunctionData({
        abi: tokenIndexRemoveAbi,
        functionName: "remove",
        args: [input.tokenAddress],
      }),
    },
  ];
}

/**
 * The owner's emergency withdrawal of pool liquidity.
 *
 * In decoupled mode `fees[token]` is reserved and cannot leave through this
 * path, so a caller asking for the whole balance of such a pool gets
 * `InsufficientBalance`; quote the withdrawable figure before offering it.
 */
export function buildWithdrawPoolLiquidityCalls(input: {
  poolAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountRaw: string;
}): CaliburCall[] {
  assertContractAddress(input.poolAddress, "pool");
  assertContractAddress(input.tokenAddress, "voucher");
  assertContractAddress(input.recipientAddress, "recipient");
  return [
    {
      to: input.poolAddress,
      value: "0",
      data: encodeFunctionData({
        abi: swapPoolWithdrawLiquidityAbi,
        functionName: "withdrawLiquidity",
        args: [input.tokenAddress, input.recipientAddress, parsePositiveAmount(input.amountRaw)],
      }),
    },
  ];
}

/**
 * What a pool charges for a swap and who it is paid to.
 *
 * Two contracts, one steward decision, so one batch: the rate lives on the
 * pool's FeePolicy and the recipient on SwapPool itself, and relaying them
 * apart would leave a pool charging a fee it has nowhere to pay — or paying an
 * address a rate change was meant to accompany.
 *
 * Either field may be omitted, which leaves that contract untouched; a batch
 * that would change nothing is refused rather than relayed.
 *
 * `setFeeAddress` reverts `Sealed` if the pool's `FEEADDRESS_STATE` bit is set,
 * which is not something the catalog records, so that failure surfaces at relay
 * rather than at validation.
 */
export function buildSetPoolFeeCalls(input: {
  poolAddress: `0x${string}`;
  /** Required only when changing the rate — the fee policy is a separate contract. */
  feePolicyAddress: `0x${string}` | null;
  /** The new default fee in PPM. Omitted leaves the current rate. */
  feePpm?: string;
  /** The new recipient. Omitted leaves the current one. */
  feeAddress?: `0x${string}`;
}): CaliburCall[] {
  assertContractAddress(input.poolAddress, "pool");
  const calls: CaliburCall[] = [];

  if (input.feePpm !== undefined) {
    const feePolicy = requireDependency(input.feePolicyAddress, "fee policy");
    const feePpm = parseAmount(input.feePpm);
    if (feePpm > BigInt(POOL_FEE_PPM_MAX)) {
      throw new Error("A swap fee cannot be more than 100%.");
    }
    calls.push({
      to: feePolicy,
      value: "0",
      data: encodeFunctionData({
        abi: feePolicySetDefaultFeeAbi,
        functionName: "setDefaultFee",
        args: [feePpm],
      }),
    });
  }

  if (input.feeAddress !== undefined) {
    assertContractAddress(input.feeAddress, "fee recipient");
    calls.push({
      to: input.poolAddress,
      value: "0",
      data: encodeFunctionData({
        abi: swapPoolSetFeeAddressAbi,
        functionName: "setFeeAddress",
        args: [input.feeAddress],
      }),
    });
  }

  if (calls.length === 0) {
    throw new Error("Changing a pool's fee needs a new rate, a new recipient, or both.");
  }
  return calls;
}

/**
 * The deposit cap, in the voucher's own base units, that holds a given amount of
 * the pool's unit of account.
 *
 * The steward thinks in the unit the pool is priced in — "this voucher may bring
 * 50,000 KES into the pool" — while `Limiter.setLimitFor` counts tokens. The two
 * are related by the rate being set in the same batch, so the conversion belongs
 * here beside the call that consumes it.
 *
 * Floor division: a cap rounded up would admit more value than the steward
 * named.
 */
export function poolVoucherCapFromUnitValue(
  unitValueRaw: string,
  exchangeRatePpm: string,
  decimals: number,
): string {
  const rate = parsePositiveAmount(exchangeRatePpm);
  assertTokenDecimals(decimals);
  return ((parseAmount(unitValueRaw) * 10n ** BigInt(decimals)) / rate).toString();
}

/** The inverse, for reading an existing cap back into the steward's unit. */
export function poolVoucherUnitValueFromCap(
  capRaw: string,
  exchangeRatePpm: string,
  decimals: number,
): string {
  const rate = parsePositiveAmount(exchangeRatePpm);
  assertTokenDecimals(decimals);
  return ((parseAmount(capRaw) * rate) / 10n ** BigInt(decimals)).toString();
}

/** Parity — what the quoter reads for a token whose rate was never set. */
export function poolParityPriceIndex(): string {
  return PRICE_INDEX_SCALE.toString();
}

function buildPricingCall(input: BuildAddPoolVoucherCallsInput): CaliburCall | null {
  if (!input.pricing || input.pricing.kind === "decimal") return null;

  const quoter = requireDependency(input.quoterAddress, "quoter");

  if (input.pricing.kind === "relative") {
    return {
      to: quoter,
      value: "0",
      data: encodeFunctionData({
        abi: relativeQuoterSetPriceIndexValueAbi,
        functionName: "setPriceIndexValue",
        args: [input.tokenAddress, parsePositiveAmount(input.pricing.exchangeRatePpm)],
      }),
    };
  }

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

function parseAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Pool value must be a non-negative integer string.");
  return BigInt(value);
}

function parsePositiveAmount(value: string): bigint {
  const amount = parseAmount(value);
  // A zero rate is read back by the quoter as parity, so it cannot express what
  // a steward typing zero would mean. The deposit cap is the opposite case and
  // deliberately uses `parseAmount`: zero there is the limiter accepting no
  // deposits, which is a setting the contract takes and a steward may want.
  if (amount <= 0n) throw new Error("Pool value must be greater than zero.");
  return amount;
}

function assertTokenDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("Token decimals must be a non-negative integer.");
  }
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

/**
 * The two numbers a steward types when a RelativeQuoter prices a pool.
 *
 * Both are expressed in the pool's unit of account, because that is the only
 * unit a steward has an opinion in: the rate says what one voucher is worth, and
 * the credit limit says how much of that worth the pool will take. The cap the
 * limiter actually stores is derived from the pair — see
 * `poolVoucherCapFromUnitValue` — so the two fields cannot be validated apart.
 */
export type PoolVoucherRateInput = {
  exchangeRate: string;
  creditLimit: string;
};

const UNIT_VALUE_PATTERN = new RegExp(`^\\d+(\\.\\d{1,${POOL_PRICE_INDEX_DECIMALS}})?$`);

function isPositiveUnitValue(value: string): boolean {
  const trimmed = value.trim();
  return UNIT_VALUE_PATTERN.test(trimmed) && Number(trimmed) > 0;
}

/**
 * The credit limit's rule, which differs from the rate's: `setLimitFor` accepts
 * zero and stores it as "this pool may hold none of this voucher", so a steward
 * approving a voucher before deciding its limit has a valid number to submit.
 * The field still has to hold one — blank is not zero.
 */
function isNonNegativeUnitValue(value: string): boolean {
  const trimmed = value.trim();
  return UNIT_VALUE_PATTERN.test(trimmed) && Number(trimmed) >= 0;
}

/**
 * Validates a rate, and a credit limit only where the pool has a limiter to
 * write one to. A pool published without one takes uncapped deposits and there
 * is no contract to reject, so requiring the field would block a legitimate
 * submission.
 */
export function poolVoucherRateSchema(options: { requireCreditLimit: boolean }) {
  return z
    .object({ exchangeRate: z.string(), creditLimit: z.string() })
    .superRefine((value, ctx) => {
      if (!isPositiveUnitValue(value.exchangeRate)) {
        ctx.addIssue({
          code: "custom",
          path: ["exchangeRate"],
          message: "Enter an exchange rate greater than zero",
        });
      }
      if (options.requireCreditLimit && !isNonNegativeUnitValue(value.creditLimit)) {
        ctx.addIssue({
          code: "custom",
          path: ["creditLimit"],
          message: "Enter a credit limit of zero or more",
        });
      }
    });
}

/**
 * Turns what the steward typed into the arguments the batch builder takes.
 *
 * The cap is omitted rather than zeroed when the pool has no limiter: passing
 * `0` would be the limiter's "reject every deposit", which is the opposite of
 * the uncapped pool the steward is looking at.
 */
export function toPoolVoucherRateConfig(input: {
  values: PoolVoucherRateInput;
  decimals: number;
  hasLimiter: boolean;
}): { pricing: RelativePoolVoucherPricing; depositCapRaw?: string } {
  const exchangeRatePpm = parseTokenAmount(
    input.values.exchangeRate.trim(),
    POOL_PRICE_INDEX_DECIMALS,
  );
  const pricing: RelativePoolVoucherPricing = { kind: "relative", exchangeRatePpm };
  if (!input.hasLimiter) return { pricing };

  const unitValueRaw = parseTokenAmount(input.values.creditLimit.trim(), POOL_PRICE_INDEX_DECIMALS);
  return {
    pricing,
    depositCapRaw: poolVoucherCapFromUnitValue(unitValueRaw, exchangeRatePpm, input.decimals),
  };
}

/** Reads a configured voucher back into the fields that produced it. */
export function seedPoolVoucherRateInput(input: {
  exchangeRatePpm: string;
  capRaw: string | null;
  decimals: number | null;
}): PoolVoucherRateInput {
  const exchangeRate = formatTokenAmount(
    input.exchangeRatePpm,
    POOL_PRICE_INDEX_DECIMALS,
    POOL_PRICE_INDEX_DECIMALS,
  );
  // A stored zero reads back as "0", not as an empty field: it is a limit the
  // steward set, and blanking it would offer to re-submit a different value.
  // Only a cap the catalog never recorded, or one no conversion can be done for,
  // leaves the field empty.
  if (input.capRaw === null || input.decimals === null) {
    return { exchangeRate, creditLimit: "" };
  }
  const unitValueRaw = poolVoucherUnitValueFromCap(
    input.capRaw,
    input.exchangeRatePpm,
    input.decimals,
  );
  return {
    exchangeRate,
    creditLimit: formatTokenAmount(unitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2),
  };
}

export const oracleQuoterBaseCurrencyAbi = parseAbi([
  "function baseCurrency() view returns (address)",
]);

export const ownableAbi = parseAbi([
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
]);

export const poolOwnershipWiringAbi = parseAbi([
  "function tokenRegistry() view returns (address)",
  "function tokenLimiter() view returns (address)",
  "function feePolicy() view returns (address)",
  "function quoter() view returns (address)",
  "function protocolFeeController() view returns (address)",
]);

export type PoolOwnershipContracts = {
  poolAddress: `0x${string}`;
  registryAddress: `0x${string}` | null;
  limiterAddress: `0x${string}` | null;
  feePolicyAddress: `0x${string}` | null;
  quoterAddress: `0x${string}` | null;
  protocolFeeControllerAddress: `0x${string}` | null;
  quoterType: "decimal" | "relative" | "oracle" | null;
};

/** Dependencies first, SwapPool last; shared contracts are never handed over. */
export function poolOwnershipTargets(input: PoolOwnershipContracts): `0x${string}`[] {
  assertContractAddress(input.poolAddress, "pool");
  if (!["decimal", "relative", "oracle"].includes(input.quoterType ?? "")) {
    throw new Error(
      "This pool's pricing implementation is unknown. Ask support to reconcile its catalog record.",
    );
  }
  const targets = [
    requireDependency(input.registryAddress, "token registry"),
    requireDependency(input.limiterAddress, "limiter"),
    requireDependency(input.feePolicyAddress, "fee policy"),
  ];
  const quoter = requireDependency(input.quoterAddress, "quoter");
  if (input.quoterType !== "decimal") targets.push(quoter);
  targets.push(input.poolAddress);
  const allContracts = input.quoterType === "decimal" ? [...targets, quoter] : targets;
  if (
    new Set(allContracts.map((address) => address.toLowerCase())).size !== allContracts.length ||
    allContracts.some(
      (address) => address.toLowerCase() === input.protocolFeeControllerAddress?.toLowerCase(),
    )
  ) {
    throw new Error(
      "This pool has overlapping contract addresses. Ask support to reconcile its wiring.",
    );
  }
  return targets;
}

export function ownershipRecipientSchema(
  ownerAddress: string,
  contracts: readonly (string | null)[],
) {
  return z
    .string()
    .trim()
    .refine((value) => isAddress(value) && value.toLowerCase() !== zeroAddress, {
      message: "Enter a valid wallet address",
    })
    .refine((value) => value.toLowerCase() !== ownerAddress.toLowerCase(), {
      message: "New owner must be a different wallet",
    })
    .refine(
      (value) => !contracts.some((address) => address?.toLowerCase() === value.toLowerCase()),
      { message: "New owner must not be one of this asset's contracts" },
    );
}

export function buildTransferPoolOwnershipCalls(
  input: PoolOwnershipContracts & {
    ownerAddress: `0x${string}`;
    newOwnerAddress: `0x${string}`;
  },
): CaliburCall[] {
  const targets = poolOwnershipTargets(input);
  const recipient = ownershipRecipientSchema(input.ownerAddress, [
    ...targets,
    input.quoterAddress,
    input.protocolFeeControllerAddress,
  ]).parse(input.newOwnerAddress) as `0x${string}`;
  return targets.map((to) => ({
    to,
    value: "0",
    data: encodeFunctionData({
      abi: ownableAbi,
      functionName: "transferOwnership",
      args: [recipient],
    }),
  }));
}

/**
 * SwapPool seal bits. Each one locks the matching setter. `seal` ORs them into
 * `sealState`, so a bit already set reverts `AlreadyLocked`.
 *
 * Fee-address seal also reverts when `feeAddress` is still zero. The builder
 * cannot see that, so the caller reads `feeAddress` before offering the bit.
 */
export const POOL_SEAL_FEE = 1;
export const POOL_SEAL_FEE_ADDRESS = 2;
export const POOL_SEAL_QUOTER = 4;
export const POOL_SEAL_REGISTRY = 8;
export const POOL_SEAL_LIMITER = 16;
export const POOL_SEAL_MAX = 31;

export const swapPoolSealAbi = parseAbi([
  "function seal(uint8 state) returns (uint8)",
  "function sealState() view returns (uint8)",
  "function isSealed(uint8 state) view returns (bool)",
]);

export function buildSealPoolCall(input: {
  poolAddress: `0x${string}`;
  state: number;
}): CaliburCall {
  assertContractAddress(input.poolAddress, "pool");
  if (!Number.isInteger(input.state) || input.state < 1 || input.state > POOL_SEAL_MAX) {
    throw new Error("Pool seal state must be an integer from 1 to 31.");
  }
  return {
    to: input.poolAddress,
    value: "0",
    data: encodeFunctionData({
      abi: swapPoolSealAbi,
      functionName: "seal",
      args: [input.state],
    }),
  };
}

/**
 * Pair fees live in a private mapping. `getFee` returns the override when it is
 * non-zero and the default otherwise, so storing zero does not create an
 * override. A steward who wants the default calls `removePairFee`.
 */
export const feePolicyPairFeeAbi = parseAbi([
  "function setPairFee(address tokenIn, address tokenOut, uint256 fee)",
  "function removePairFee(address tokenIn, address tokenOut)",
  "function getFee(address tokenIn, address tokenOut) view returns (uint256)",
]);

export function buildSetPairFeeCall(input: {
  feePolicyAddress: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  feePpm: string;
}): CaliburCall {
  assertContractAddress(input.feePolicyAddress, "fee policy");
  assertContractAddress(input.tokenIn, "token in");
  assertContractAddress(input.tokenOut, "token out");
  if (input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase()) {
    throw new Error("Pair fee tokens must be different.");
  }
  const fee = parseAmount(input.feePpm);
  if (fee <= 0n) {
    throw new Error("A pair fee of zero is the default. Remove the pair fee instead.");
  }
  if (fee > BigInt(POOL_FEE_PPM_MAX)) throw new Error("Pair fee cannot exceed 100%.");
  return {
    to: input.feePolicyAddress,
    value: "0",
    data: encodeFunctionData({
      abi: feePolicyPairFeeAbi,
      functionName: "setPairFee",
      args: [input.tokenIn, input.tokenOut, fee],
    }),
  };
}

export function buildRemovePairFeeCall(input: {
  feePolicyAddress: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
}): CaliburCall {
  assertContractAddress(input.feePolicyAddress, "fee policy");
  assertContractAddress(input.tokenIn, "token in");
  assertContractAddress(input.tokenOut, "token out");
  return {
    to: input.feePolicyAddress,
    value: "0",
    data: encodeFunctionData({
      abi: feePolicyPairFeeAbi,
      functionName: "removePairFee",
      args: [input.tokenIn, input.tokenOut],
    }),
  };
}

/** OracleQuoter.MIN_MULTIPLIER / MAX_MULTIPLIER. 900_000 is 0.9x; parity is the ceiling. */
export const ORACLE_MIN_MULTIPLIER = 900_000;
export const ORACLE_MAX_MULTIPLIER = POOL_FEE_PPM_MAX;

export const oracleQuoterPolicyAbi = parseAbi([
  "function setMaxStaleness(uint256 maxStaleness)",
  "function setMultiplier(uint256 multiplier)",
  "function removeOracle(address token)",
  "function maxStaleness() view returns (uint256)",
  "function multiplier() view returns (uint256)",
  "function oracleMaxStaleness(address token) view returns (uint256)",
  "function oracles(address token) view returns (address)",
]);

/** Zero is the contract's "no extra bound" and is stored as written. */
export function buildSetOracleMaxStalenessCall(input: {
  quoterAddress: `0x${string}`;
  maxStalenessSeconds: string;
}): CaliburCall {
  assertContractAddress(input.quoterAddress, "quoter");
  return {
    to: input.quoterAddress,
    value: "0",
    data: encodeFunctionData({
      abi: oracleQuoterPolicyAbi,
      functionName: "setMaxStaleness",
      args: [parseAmount(input.maxStalenessSeconds)],
    }),
  };
}

export function buildSetOracleMultiplierCall(input: {
  quoterAddress: `0x${string}`;
  multiplierPpm: string;
}): CaliburCall {
  assertContractAddress(input.quoterAddress, "quoter");
  const multiplier = parseAmount(input.multiplierPpm);
  if (multiplier < BigInt(ORACLE_MIN_MULTIPLIER) || multiplier > BigInt(ORACLE_MAX_MULTIPLIER)) {
    throw new Error("Oracle multiplier must be between 0.9x and 1x.");
  }
  return {
    to: input.quoterAddress,
    value: "0",
    data: encodeFunctionData({
      abi: oracleQuoterPolicyAbi,
      functionName: "setMultiplier",
      args: [multiplier],
    }),
  };
}

export function buildRemoveOracleCall(input: {
  quoterAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
}): CaliburCall {
  assertContractAddress(input.quoterAddress, "quoter");
  assertContractAddress(input.tokenAddress, "token");
  return {
    to: input.quoterAddress,
    value: "0",
    data: encodeFunctionData({
      abi: oracleQuoterPolicyAbi,
      functionName: "removeOracle",
      args: [input.tokenAddress],
    }),
  };
}

/**
 * A holder cap on the limiter. Zero is a real cap: the limiter then accepts no
 * further balance for that holder. Distinct from the pool's own deposit cap,
 * which passes the pool as the holder.
 */
export function buildSetHolderLimitCall(input: {
  limiterAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  holderAddress: `0x${string}`;
  limitRaw: string;
}): CaliburCall {
  assertContractAddress(input.limiterAddress, "limiter");
  assertContractAddress(input.tokenAddress, "token");
  assertContractAddress(input.holderAddress, "holder");
  return {
    to: input.limiterAddress,
    value: "0",
    data: encodeFunctionData({
      abi: limiterSetLimitForAbi,
      functionName: "setLimitFor",
      args: [input.tokenAddress, input.holderAddress, parseAmount(input.limitRaw)],
    }),
  };
}
