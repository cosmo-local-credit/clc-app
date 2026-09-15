import type { AccountToken } from "@clc/api/features/accounts/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import {
  poolParityPriceIndex,
  poolVoucherUnitValueFromCap,
} from "@clc/core/features/pool-admin/logic";
import { type PoolDepositCap, poolDepositCap } from "@clc/core/features/pools/logic";

/** What a pool holds of one voucher, and how much more it will take. */
export type PoolHolding = {
  /** Lowercased, so it is also the key every source is matched on. */
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number | null;
  iconUrl: string | null;
  /** Raw on-chain integer. */
  balanceRaw: string;
  /**
   * The balance restated in the pool's unit of account, scaled to
   * `POOL_PRICE_INDEX_DECIMALS`. Null when nothing can price it — an unknown
   * decimals leaves the conversion undefined rather than approximate.
   */
  unitValueRaw: string | null;
  /** The quoter's price index for the voucher, or null when it was not read. */
  ratePpm: string | null;
  cap: PoolDepositCap;
  /**
   * How full the cap is, 0–100. Null wherever there is no cap to be full of, so
   * a bar is drawn only where the number means something.
   */
  fillPercent: number | null;
  /**
   * Raw fees accrued in this voucher, or null when the treasury was not read.
   * Not part of `balanceRaw`'s meaning — under decoupled fees the pool holds
   * both and only one of them is liquidity.
   */
  feesRaw: string | null;
  /** False when nothing could price this voucher, so `unitValueRaw` is null. */
  priced: boolean;
  /**
   * True when the voucher reached this list through the pool's on-chain balance
   * rather than its catalog row. Registry-seeded tokens and ones the indexer has
   * not projected are held and swappable while absent from the catalog, so they
   * are listed rather than dropped — but nothing off-chain describes them.
   */
  uncatalogued: boolean;
};

export type BuildPoolHoldingsInput = {
  pool: UserPool;
  /** The catalog's view: names, decimals and the recorded deposit cap. */
  vouchers: PoolVoucher[];
  /** On-chain balances, keyed by lowercased token address. */
  treasury?: Map<string, { balanceRaw: string; feesRaw: string }>;
  /** The indexer's view of what the pool address holds. Catches what the catalog misses. */
  indexedTokens?: AccountToken[];
  /** Quoter price indexes, keyed by lowercased token address. */
  rates?: Map<string, bigint>;
  /**
   * Whether the pool can be valued at all. False for a pool whose quoter does
   * not expose a readable rate — an oracle- or decimal-quoted pool — where
   * falling back to parity would state a valuation nothing on chain supports.
   * Holdings still list; they just carry no unit-of-account figure.
   */
  priced?: boolean;
};

/**
 * One row per voucher the pool holds or lists, richest source winning per field.
 *
 * Three sources disagree on purpose. The catalog names a voucher and records the
 * cap a steward set; the chain says what the pool actually holds right now; the
 * indexer knows about tokens the catalog has not projected. A holdings screen
 * that read only the catalog would under-report a pool seeded at `initialize`,
 * and one that read only the chain could not name a single row.
 *
 * Ordered by what the pool is worth, largest first, with unpriced rows after the
 * priced ones — a reader scanning a phone screen wants the pool's weight, not
 * the order the catalog happened to page in.
 */
export function buildPoolHoldings({
  pool,
  vouchers,
  treasury,
  indexedTokens,
  rates,
  priced = true,
}: BuildPoolHoldingsInput): PoolHolding[] {
  const byAddress = new Map<string, PoolHolding>();

  for (const voucher of vouchers) {
    const tokenAddress = voucher.tokenAddress.toLowerCase();
    byAddress.set(
      tokenAddress,
      holding({
        tokenAddress,
        name: voucher.name,
        symbol: voucher.symbol,
        decimals: voucher.decimals,
        iconUrl: voucher.iconUrl,
        balanceRaw: treasury?.get(tokenAddress)?.balanceRaw ?? null,
        feesRaw: treasury?.get(tokenAddress)?.feesRaw ?? null,
        cap: poolDepositCap(pool, voucher),
        ratePpm: rates?.get(tokenAddress),
        priced,
        uncatalogued: false,
      }),
    );
  }

  for (const token of indexedTokens ?? []) {
    const tokenAddress = token.tokenAddress.toLowerCase();
    const existing = byAddress.get(tokenAddress);
    if (existing) {
      // The chain is preferred when it answered; the indexer fills the gap for a
      // voucher the treasury read did not cover.
      if (existing.balanceRaw === "0" && !treasury?.has(tokenAddress)) {
        byAddress.set(tokenAddress, { ...existing, ...valued(existing, token.balance) });
      }
      continue;
    }
    byAddress.set(
      tokenAddress,
      holding({
        tokenAddress,
        name: token.tokenName,
        symbol: token.tokenSymbol,
        decimals: token.tokenDecimals,
        iconUrl: token.iconUrl,
        balanceRaw: treasury?.get(tokenAddress)?.balanceRaw ?? token.balance,
        feesRaw: treasury?.get(tokenAddress)?.feesRaw ?? null,
        // Nothing in the catalog describes it, so nothing records a cap either.
        cap: pool.limiterAddress ? { kind: "unrecorded" } : { kind: "uncapped" },
        ratePpm: rates?.get(tokenAddress),
        priced,
        uncatalogued: true,
      }),
    );
  }

  return [...byAddress.values()].sort(compareByValue);
}

function holding(input: {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number | null;
  iconUrl: string | null;
  balanceRaw: string | null;
  feesRaw: string | null;
  cap: PoolDepositCap;
  ratePpm: bigint | undefined;
  priced: boolean;
  uncatalogued: boolean;
}): PoolHolding {
  const balanceRaw = input.balanceRaw ?? "0";
  // A token the quoter never priced reads back as parity, which is what the
  // contract itself does with it — a rate of zero would claim the pool values
  // the voucher at nothing, the one thing it never means.
  const ratePpm = input.ratePpm === undefined ? null : input.ratePpm.toString();
  const base: PoolHolding = {
    tokenAddress: input.tokenAddress,
    name: input.name,
    symbol: input.symbol,
    decimals: input.decimals,
    iconUrl: input.iconUrl,
    balanceRaw,
    unitValueRaw: null,
    ratePpm,
    cap: input.cap,
    fillPercent: null,
    feesRaw: input.feesRaw,
    priced: input.priced,
    uncatalogued: input.uncatalogued,
  };
  return { ...base, ...valued(base, balanceRaw) };
}

/** The two figures that move with the balance, recomputed for a new one. */
function valued(
  holding: PoolHolding,
  balanceRaw: string,
): Pick<PoolHolding, "balanceRaw" | "unitValueRaw" | "fillPercent"> {
  return {
    balanceRaw,
    unitValueRaw: holding.priced ? unitValue(balanceRaw, holding.ratePpm, holding.decimals) : null,
    fillPercent: capFill(balanceRaw, holding.cap),
  };
}

/**
 * A raw balance in the pool's unit of account.
 *
 * Reuses the limiter's own conversion, which is the same arithmetic in the same
 * direction: `amount x rate / 10^decimals`. Keeping one implementation means a
 * holding and the cap it is measured against can never be scaled differently.
 */
function unitValue(
  balanceRaw: string,
  ratePpm: string | null,
  decimals: number | null,
): string | null {
  if (decimals === null) return null;
  try {
    return poolVoucherUnitValueFromCap(balanceRaw, ratePpm ?? poolParityPriceIndex(), decimals);
  } catch {
    // An unscalable amount or an out-of-range decimals: report no value rather
    // than a wrong one.
    return null;
  }
}

/**
 * How much of the deposit cap the balance has taken, 0–100.
 *
 * Only a recorded cap has a fill: an uncapped pool has no denominator, and a
 * blocked voucher is already full by definition whatever it holds.
 */
function capFill(balanceRaw: string, cap: PoolDepositCap): number | null {
  if (cap.kind === "blocked") return 100;
  if (cap.kind !== "capped") return null;
  let balance: bigint;
  let limit: bigint;
  try {
    balance = BigInt(balanceRaw);
    limit = BigInt(cap.raw);
  } catch {
    return null;
  }
  if (limit <= 0n) return 100;
  if (balance >= limit) return 100;
  if (balance <= 0n) return 0;
  // Scaled before dividing so a balance under a ten-thousandth of the cap does
  // not floor to a bar that reads as empty.
  return Number((balance * 10_000n) / limit) / 100;
}

/** Priced rows first, then by what the pool holds, then alphabetically. */
function compareByValue(a: PoolHolding, b: PoolHolding): number {
  if (a.unitValueRaw !== null && b.unitValueRaw !== null) {
    const left = BigInt(a.unitValueRaw);
    const right = BigInt(b.unitValueRaw);
    if (left !== right) return left > right ? -1 : 1;
  } else if (a.unitValueRaw !== b.unitValueRaw) {
    return a.unitValueRaw === null ? 1 : -1;
  }
  return a.symbol.localeCompare(b.symbol);
}

/**
 * What the pool is worth in its unit of account, and how much of itself that
 * total can account for.
 *
 * `unpricedCount` is reported alongside rather than folded in: a total that
 * silently omits the vouchers nothing could price reads as the whole pool, and
 * a reader deciding whether to deposit needs to know it is not.
 */
export function totalPoolHoldingValue(holdings: PoolHolding[]): {
  raw: string;
  unpricedCount: number;
} {
  let total = 0n;
  let unpricedCount = 0;
  for (const holding of holdings) {
    if (holding.unitValueRaw === null) {
      unpricedCount += 1;
      continue;
    }
    total += BigInt(holding.unitValueRaw);
  }
  return { raw: total.toString(), unpricedCount };
}
