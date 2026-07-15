import type { HexAddress, UserPool } from "#/features/pools/api/pools-client";

export type PoolVoucherPlaceholder = {
  id: string;
  name: string;
  description: string;
  symbol: string;
  tokenAddress: HexAddress | null;
  decimals: number | null;
  iconUrl: string | null;
  offerCount: number | null;
  tags?: string[];
  isPlaceholder: true;
};

/**
 * Temporary placeholder voucher/token adapter for pool swap UI.
 *
 * The backend pool endpoints currently do not return pool voucher/token members.
 * Keep display-only fixture data isolated here so a future pool-vouchers endpoint
 * can replace this module/hook without mixing placeholder fields into API pools.
 */
export function getPlaceholderPoolVouchers(pool: UserPool): PoolVoucherPlaceholder[] {
  const seed = `${pool.name} ${pool.symbol}`.toLowerCase();
  if (seed.includes("solar") || seed.includes("coop")) {
    return [
      voucher(
        "solar",
        "Local Solar Coop",
        "Solar energy vouchers accepted by pool members.",
        "SOLAR",
        8,
        ["Energy"],
      ),
      voucher(
        "repair",
        "Repair Credit",
        "Maintenance services for local solar equipment.",
        "RPR",
        3,
        ["Services"],
      ),
    ];
  }
  if (seed.includes("food") || seed.includes("fresh") || seed.includes("farm")) {
    return [
      voucher(
        "fresh",
        "Fresh Food Circle",
        "Produce vouchers from nearby market sellers.",
        "FFC",
        12,
        ["Food"],
      ),
      voucher("grain", "Grain Basket", "Staple food credits for participating shops.", "GRN", 5, [
        "Groceries",
      ]),
    ];
  }
  return [
    voucher(
      `${pool.symbol.toLowerCase()}-member`,
      `${pool.name} Voucher`,
      "Display-only voucher option until pool token data is available.",
      pool.symbol || "POOL",
      4,
      pool.tags.slice(0, 2),
    ),
    voucher(
      "usdc",
      "USD Coin",
      "Stable token display option for pool swap previews.",
      "USDC",
      null,
      ["Stable"],
    ),
  ];
}

function voucher(
  id: string,
  name: string,
  description: string,
  symbol: string,
  offerCount: number | null,
  tags?: string[],
): PoolVoucherPlaceholder {
  return {
    id,
    name,
    description,
    symbol,
    tokenAddress: null,
    decimals: null,
    iconUrl: null,
    offerCount,
    tags,
    isPlaceholder: true,
  };
}
