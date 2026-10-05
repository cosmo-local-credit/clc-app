import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { poolAvailableLiquidityRaw } from "@clc/core/features/pool-swaps/logic";
import {
  type PoolDepositCap,
  poolDepositCap,
  poolDepositHeadroomRaw,
} from "@clc/core/features/pools/logic";

import type { WalletToken } from "#/components/wallet";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";

/** One voucher's on-chain figures, as read by `usePoolSwapTokenReads`. */
export type PoolSwapTokenReads = {
  /** What the connected wallet holds of the voucher. */
  holderBalanceRaw: string;
  /** What the pool holds — liquidity on the To side, the cap's base on the From side. */
  poolBalanceRaw: string;
  /** Pool fees accrued in the voucher, reserved when the pool's fees are decoupled. */
  feesRaw: string;
  /**
   * `limitOf(token, pool)`, or null when the pool has no limiter or the read
   * failed. Null is not zero: it means no ceiling is known, not a ceiling of
   * nothing.
   */
  limitRaw: string | null;
};

/** A voucher as the swap screen needs it: identity from the catalog, numbers from the chain. */
export type PoolSwapToken = {
  /** Lowercased token address — the picker's id and the key every source is matched on. */
  id: string;
  /** For `TokenLogo` and the symbol shown on the select button. */
  token: WalletToken;
  /** Null where the catalog never recorded it, which leaves every amount unsizable. */
  decimals: number | null;
  /** The holder's balance, raw. */
  balanceRaw: string;
  held: boolean;
  /** What the pool can pay out, fees already reserved where they are decoupled. */
  liquidityRaw: string;
  cap: PoolDepositCap;
  /** Raw room left under the cap, or null where nothing recorded one to measure against. */
  depositHeadroomRaw: string | null;
  /** Selectable as the input side: held, sizable, and with room left under the cap. */
  canSwapIn: boolean;
  /** Selectable as the output side: sizable, and the pool has something to pay out. */
  canSwapOut: boolean;
};

/** What the chain says about a token the catalog has no record of. Each field null when unreadable. */
export type RegistryTokenMetadata = {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
};

/**
 * The vouchers a pool admits, with its registry as the authority.
 *
 * `SwapPool` runs `have(token)` against the registry on both legs of a swap, so
 * the registry's entries are exactly the tokens a swap can use. The catalog's
 * pool voucher list is a projection of it and disagrees in both directions: a
 * token seeded at `initialize` — usually the pool's own voucher — is a member the
 * catalog never lists, and a row the catalog still lists may already be removed.
 * Built from the catalog alone, the "You receive" menu silently omits members.
 *
 * Where the catalog knows a member its record is kept, for the icon and the
 * description only it has. A member it does not know is listed from what the
 * chain reports; a field the chain would not report stays null, which leaves
 * that row visible but unsizable rather than absent.
 *
 * A null `registry` is a pool with no registry configured, which admits anything
 * — the catalog is then the best list there is.
 */
export function poolVouchersFromRegistry({
  catalog,
  registry,
  metadata,
}: {
  catalog: PoolVoucher[];
  registry: readonly string[] | null;
  metadata?: ReadonlyMap<string, RegistryTokenMetadata>;
}): PoolVoucher[] {
  if (registry === null) return catalog;

  const known = new Map(catalog.map((voucher) => [voucher.tokenAddress.toLowerCase(), voucher]));
  const seen = new Set<string>();
  const vouchers: PoolVoucher[] = [];
  for (const address of registry) {
    const id = address.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    vouchers.push(
      known.get(id) ??
        registryOnlyVoucher(address as PoolVoucher["tokenAddress"], metadata?.get(id)),
    );
  }
  return vouchers;
}

function registryOnlyVoucher(
  tokenAddress: PoolVoucher["tokenAddress"],
  meta: RegistryTokenMetadata | undefined,
): PoolVoucher {
  const fallbackLabel = formatVoucherAddress(tokenAddress);
  return {
    id: `registry:${tokenAddress.toLowerCase()}`,
    chainId: null,
    name: meta?.name ?? meta?.symbol ?? fallbackLabel,
    description: "",
    symbol: meta?.symbol ?? fallbackLabel,
    tokenAddress,
    decimals: meta?.decimals ?? null,
    ownerAddress: null,
    voucherType: null,
    voucherUoa: null,
    voucherValue: null,
    locationName: null,
    iconUrl: null,
    bannerUrl: null,
    active: true,
    internal: false,
    isAllowed: true,
    tokenLimit: null,
    oracleFeedId: null,
    oracleName: null,
    oracleAddress: null,
    offerCount: 0,
    availableOfferCount: 0,
    tags: [],
  };
}

export type BuildPoolSwapTokensInput = {
  pool: UserPool;
  /** The pool's catalog vouchers — `pool_tokens.is_allowed`, the eligibility set. */
  vouchers: PoolVoucher[];
  /** Chain reads keyed by lowercased token address. Absent while they are in flight. */
  reads?: Map<string, PoolSwapTokenReads>;
};

/**
 * Every voucher this pool admits, annotated with what the holder and the pool
 * each have of it.
 *
 * The two sources answer different questions and neither is sufficient alone.
 * The catalog says which tokens the pool's registry admits and names them; only
 * the chain says how much of one you hold right now, and that is the figure both
 * `Max` and the exceeds-balance check spend. Reading it per voucher rather than
 * from the indexer's holdings list also sidesteps that list's paging: a voucher
 * you have not moved recently falls off its first page and would otherwise read
 * as a zero balance, indistinguishable from one you do not hold.
 *
 * Nothing is dropped. A voucher you hold none of, one the pool is full of, and
 * one the catalog never sized all stay in the list with the reason on the row —
 * a holder who knows this pool takes their voucher needs to see it and learn
 * why it is unusable, not find it missing.
 *
 * Ordered held-first by balance, then by symbol, so the From picker's two
 * sections fall out of one sorted array.
 */
export function buildPoolSwapTokens({
  pool,
  vouchers,
  reads,
}: BuildPoolSwapTokensInput): PoolSwapToken[] {
  const feesDecoupled = pool.feesDecoupled;

  return vouchers
    .map((voucher) => {
      const id = voucher.tokenAddress.toLowerCase();
      const read = reads?.get(id);
      const balanceRaw = read?.holderBalanceRaw ?? "0";
      const poolBalanceRaw = read?.poolBalanceRaw ?? "0";
      // The chain's limit is preferred over the catalog's: `tokenLimit` is the
      // indexer's projection of `LimitSet` and lags a steward who has just
      // raised the cap. Where the read failed the catalog is still better than
      // nothing.
      const cap = poolDepositCap(pool, {
        tokenLimit: read?.limitRaw ?? voucher.tokenLimit,
      });
      const liquidityRaw = poolAvailableLiquidityRaw({
        balanceRaw: poolBalanceRaw,
        feesRaw: read?.feesRaw ?? "0",
        feesDecoupled,
      });
      const depositHeadroomRaw = poolDepositHeadroomRaw(cap, poolBalanceRaw);
      const held = isPositive(balanceRaw);
      const sizable = voucher.decimals !== null;

      return {
        id,
        token: accountTokenToWalletToken({
          id: 0,
          tokenAddress: voucher.tokenAddress,
          tokenSymbol: voucher.symbol,
          tokenName: voucher.name,
          // Only ever read for display, and every path that formats an amount is
          // gated on `decimals` being known — see `canSwapIn` / `canSwapOut`.
          tokenDecimals: voucher.decimals ?? 18,
          balance: balanceRaw,
          iconUrl: voucher.iconUrl,
          lastDateBlock: "",
        }),
        decimals: voucher.decimals,
        balanceRaw,
        held,
        liquidityRaw,
        cap,
        depositHeadroomRaw,
        // A headroom of null is an unknown ceiling, not a closed one: refusing on
        // a number nobody recorded would block a swap the contract would take.
        canSwapIn: held && sizable && depositHeadroomRaw !== "0",
        canSwapOut: sizable && isPositive(liquidityRaw),
      };
    })
    .sort(compareForPicker);
}

/**
 * The From side's default: the largest holding this pool will actually take.
 *
 * `excludeId` keeps it off a voucher already chosen for the other side, so a
 * holder who arrives wanting that voucher is not handed a swap of it for itself.
 */
export function defaultPoolSwapFrom(
  tokens: PoolSwapToken[],
  excludeId?: string,
): PoolSwapToken | undefined {
  return tokens.find((token) => token.canSwapIn && token.id !== excludeId);
}

/**
 * The To side's default: the pool's own voucher when it can pay it out, else
 * whatever it holds most of.
 *
 * The default voucher is what a pool is denominated in, so it is the swap a
 * holder is most often there to make. `defaultVoucherId` is a catalog id, which
 * only a catalogued voucher can match — exactly the rows this list is built
 * from.
 */
export function defaultPoolSwapTo(
  tokens: PoolSwapToken[],
  pool: UserPool,
  vouchers: PoolVoucher[],
  excludeId?: string,
): PoolSwapToken | undefined {
  const available = tokens.filter((token) => token.canSwapOut && token.id !== excludeId);
  const defaultAddress = pool.defaultVoucherId
    ? vouchers.find((voucher) => voucher.id === pool.defaultVoucherId)?.tokenAddress.toLowerCase()
    : undefined;
  const preferred = defaultAddress
    ? available.find((token) => token.id === defaultAddress)
    : undefined;
  if (preferred) return preferred;
  return available.reduce<PoolSwapToken | undefined>((most, token) => {
    if (!most) return token;
    return BigInt(token.liquidityRaw) > BigInt(most.liquidityRaw) ? token : most;
  }, undefined);
}

/** Held first, largest first within that, then alphabetically. */
function compareForPicker(a: PoolSwapToken, b: PoolSwapToken): number {
  if (a.held !== b.held) return a.held ? -1 : 1;
  if (a.held && b.held) {
    // Raw integers of different decimals are not comparable as values, but the
    // From list is a holder's own shelf rather than a valuation — putting the
    // biggest number first is the order they expect, and the pool's rates are a
    // second multicall on the critical path for what is only a default.
    const left = BigInt(a.balanceRaw);
    const right = BigInt(b.balanceRaw);
    if (left !== right) return left > right ? -1 : 1;
  }
  return a.token.symbol.localeCompare(b.token.symbol);
}

function isPositive(raw: string): boolean {
  try {
    return BigInt(raw) > 0n;
  } catch {
    return false;
  }
}
