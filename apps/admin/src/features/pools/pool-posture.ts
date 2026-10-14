import type { AdminPoolTransaction } from "@clc/api/features/admin/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import type { HexAddress } from "@clc/core/features/catalog/logic";
import { poolDepositCap } from "@clc/core/features/pools/logic";

/**
 * What the pool catalog says about a pool's operating state.
 *
 * Pure derivation over one pool record and one page of its vouchers, kept out of
 * the components so the rules that decide whether a pool can price a token or
 * accept a deposit are testable without rendering a screen.
 *
 * Every conclusion here is a statement about the **catalog**, which mirrors the
 * chain and can lag it or miss a field entirely — pools imported from federation
 * carry no dependency addresses at all. Nothing in this module claims to have
 * read the chain, and an absent value is reported as unrecorded rather than as
 * a zero address, because the two have opposite consequences on SwapPool.
 */

/** The vouchers sharing one price feed, or the ones sharing none. */
export type PoolFeedGroup = {
  /** Feed id, or `unpriced` for the vouchers with no mapping. */
  key: string;
  name: string | null;
  address: HexAddress | null;
  vouchers: PoolVoucher[];
};

/**
 * Pool vouchers grouped by the feed that prices them.
 *
 * One aggregator usually serves several vouchers, so the group is the unit of
 * blast radius: a feed that goes stale takes every voucher in its row with it.
 * The unpriced group sorts last because it is the exception, and it is present
 * only when there is something in it.
 */
export function groupPoolFeeds(vouchers: PoolVoucher[]): PoolFeedGroup[] {
  const groups = new Map<string, PoolFeedGroup>();
  const unpriced: PoolVoucher[] = [];

  for (const voucher of vouchers) {
    if (!voucher.oracleFeedId) {
      unpriced.push(voucher);
      continue;
    }
    const existing = groups.get(voucher.oracleFeedId);
    if (existing) {
      existing.vouchers.push(voucher);
      continue;
    }
    groups.set(voucher.oracleFeedId, {
      key: voucher.oracleFeedId,
      name: voucher.oracleName,
      address: voucher.oracleAddress,
      vouchers: [voucher],
    });
  }

  const priced = [...groups.values()].sort((a, b) => b.vouchers.length - a.vouchers.length);
  return unpriced.length > 0
    ? [...priced, { key: "unpriced", name: null, address: null, vouchers: unpriced }]
    : priced;
}

export type PoolComposition = {
  /** Vouchers in the fetched page, which is what every derived figure counts. */
  loaded: number;
  /** The pool record's own total, so a partial page is visible as one. */
  total: number;
  priced: number;
  unpriced: number;
  blocked: number;
  /** Distinct recorded feeds, not counting the unpriced group. */
  feeds: number;
  offers: number;
  liveOffers: number;
};

export function poolComposition(
  pool: UserPool,
  vouchers: PoolVoucher[],
  total = pool.voucherCount,
): PoolComposition {
  const feeds = new Set<string>();
  let priced = 0;
  let blocked = 0;
  let offers = 0;
  let liveOffers = 0;

  for (const voucher of vouchers) {
    if (voucher.oracleFeedId) {
      priced += 1;
      feeds.add(voucher.oracleFeedId);
    }
    if (poolDepositCap(pool, voucher).kind === "blocked") blocked += 1;
    offers += voucher.offerCount;
    liveOffers += voucher.availableOfferCount;
  }

  return {
    loaded: vouchers.length,
    total,
    priced,
    unpriced: vouchers.length - priced,
    blocked,
    feeds: feeds.size,
    offers,
    liveOffers,
  };
}

/** One of the contracts SwapPool delegates to, as the catalog recorded it. */
export type PoolDependency = {
  key: string;
  label: string;
  address: HexAddress | null;
  /**
   * Whether clc-core's deploy path writes this address into the catalog, and so
   * whether an absent one says anything about the pool.
   *
   * False for the fee recipient alone. `deployed_pools` has no `fee_address`
   * column, and `upsert-pool-from-deploy` says so in as many words — fee_ppm and
   * fee_address "have no counterpart on the deploy row and are left to the
   * importer and pool sync" — while the deploy itself initializes SwapPool with
   * `FeeAddress: ownerAddress`. Every pool this console publishes therefore has a
   * real recipient on chain and a null in the catalog, which makes a warning
   * about it fire on every healthy pool.
   */
  recordedOnDeploy: boolean;
};

export function poolDependencies(pool: UserPool): PoolDependency[] {
  return [
    {
      key: "registry",
      label: "Token registry",
      address: pool.tokenRegistryAddress,
      recordedOnDeploy: true,
    },
    { key: "limiter", label: "Limiter", address: pool.limiterAddress, recordedOnDeploy: true },
    { key: "quoter", label: "Quoter", address: pool.quoterAddress, recordedOnDeploy: true },
    {
      key: "feePolicy",
      label: "Fee policy",
      address: pool.feePolicyAddress,
      recordedOnDeploy: true,
    },
    {
      key: "feeRecipient",
      label: "Fee recipient",
      address: pool.feeAddress,
      recordedOnDeploy: false,
    },
    {
      key: "protocolController",
      label: "Protocol controller",
      address: pool.protocolFeeControllerAddress,
      recordedOnDeploy: true,
    },
  ];
}

export type PoolAdvisory = {
  id: string;
  tone: "warning" | "danger";
  title: string;
  detail: string;
};

/**
 * The things on this pool an operator should look at, and nothing else.
 *
 * The list is empty for a pool with a complete record and a priced, capped set
 * of vouchers, which is the point: a panel that always has something in it stops
 * being read. Each entry states the count and the consequence in one clause —
 * the reasons are in clc-protocol, not in a paragraph on this screen.
 */
export function poolAdvisories(
  pool: UserPool,
  composition: PoolComposition,
  { vouchersAvailable }: { vouchersAvailable: boolean },
): PoolAdvisory[] {
  const advisories: PoolAdvisory[] = [];

  // Only the pointers the deploy path records: a gap the pipeline never fills is
  // not news about this pool.
  const tracked = poolDependencies(pool).filter((dependency) => dependency.recordedOnDeploy);
  const unrecorded = tracked.filter((dependency) => dependency.address === null);
  if (unrecorded.length > 0) {
    advisories.push({
      id: "dependencies",
      tone: "warning",
      title: `${unrecorded.length} of ${tracked.length} contract pointers unrecorded`,
      detail: `No catalog address for ${unrecorded.map((entry) => entry.label.toLowerCase()).join(", ")}.`,
    });
  }

  // Derived counts are meaningless when the voucher page never arrived; an
  // advisory built on zero rows would report a healthy pool.
  if (!vouchersAvailable) return advisories;

  if (composition.unpriced > 0) {
    advisories.push({
      id: "unpriced",
      tone: "danger",
      title: `${composition.unpriced} of ${composition.loaded} vouchers unpriced`,
      detail: "An oracle quoter reverts with OracleNotSet on an unmapped token.",
    });
  }

  if (composition.blocked > 0) {
    advisories.push({
      id: "blocked",
      tone: "danger",
      title: `${composition.blocked} ${composition.blocked === 1 ? "voucher" : "vouchers"} capped at zero`,
      detail: "The limiter rejects every deposit while the cap is zero.",
    });
  }

  // Worst first. A pool that cannot quote or cannot accept a deposit is broken
  // now; a pointer the catalog never recorded is a gap in what this console can
  // tell you about it, which is a different and lesser problem.
  return advisories.sort((a, b) => toneRank(b.tone) - toneRank(a.tone));
}

function toneRank(tone: PoolAdvisory["tone"]): number {
  return tone === "danger" ? 1 : 0;
}

/** One day of the pool's indexed activity, split by the two operations it has. */
type PoolActivityPoint = {
  /** Midnight local time, ISO, so the chart's day ticks line up with the reader. */
  t: string;
  swaps: number;
  deposits: number;
};

export type PoolActivity = {
  points: PoolActivityPoint[];
  /**
   * Whether the fetched page reached back past the start of the window.
   *
   * There is no per-pool time series endpoint, so the counts are bucketed from
   * one page of transactions. A full page whose oldest row is still inside the
   * window means older days are undercounted, and a chart that undercounts
   * without saying so is worse than no chart.
   */
  complete: boolean;
};

const DAY_MS = 86_400_000;

/** Days of history the pool chart covers. */
export const POOL_ACTIVITY_DAYS = 7;

/**
 * Daily swap and deposit counts for the last week.
 *
 * Every day in the window gets a point, including the empty ones: a line drawn
 * only through the days that had activity implies a slope between them that
 * nothing happened along.
 */
export function poolActivitySeries(
  transactions: AdminPoolTransaction[],
  page: { receivedCount: number; perPage: number },
  now: Date,
): PoolActivity {
  const start = startOfDay(new Date(now.getTime() - (POOL_ACTIVITY_DAYS - 1) * DAY_MS));

  const buckets = new Map<string, PoolActivityPoint>();
  for (let day = 0; day < POOL_ACTIVITY_DAYS; day += 1) {
    const at = new Date(start.getTime() + day * DAY_MS);
    buckets.set(at.toISOString(), { t: at.toISOString(), swaps: 0, deposits: 0 });
  }

  let oldest: number | null = null;
  for (const transaction of transactions) {
    const at = new Date(transaction.t).getTime();
    if (Number.isNaN(at)) continue;
    if (oldest === null || at < oldest) oldest = at;

    const point = buckets.get(startOfDay(new Date(at)).toISOString());
    if (!point) continue;
    if (transaction.type === "deposit") point.deposits += 1;
    else point.swaps += 1;
  }

  // A short page is the whole record, however old it is. A full one only covers
  // the window if it reached past the first day in it.
  const complete =
    page.receivedCount < page.perPage || (oldest !== null && oldest < start.getTime());

  return { points: [...buckets.values()], complete };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** One voucher's offer standing, for the pool's market chart. */
export type PoolOfferPoint = {
  symbol: string;
  available: number;
  /** Offers that exist but are not currently on sale. */
  unavailable: number;
};

/** How many vouchers the offers chart shows before it stops being readable. */
const POOL_OFFER_BARS = 6;

/**
 * The pool's vouchers ranked by how many offers stand against them.
 *
 * This is the one thing on the screen that describes the marketplace rather than
 * the configuration: a pool can be perfectly wired and priced and still have
 * nothing for sale in it. Split into available and unavailable because a voucher
 * with fifty dormant offers and none live is a different situation from one with
 * five live, and a single total reads the same for both.
 *
 * Vouchers with no offers at all are dropped rather than drawn as empty bars —
 * they are the majority in a young pool and would squeeze the ones that matter.
 */
export function poolOfferSeries(vouchers: PoolVoucher[]): PoolOfferPoint[] {
  return vouchers
    .filter((voucher) => voucher.offerCount > 0)
    .map((voucher) => ({
      symbol: voucher.symbol,
      available: voucher.availableOfferCount,
      unavailable: Math.max(0, voucher.offerCount - voucher.availableOfferCount),
    }))
    .sort((a, b) => b.available + b.unavailable - (a.available + a.unavailable))
    .slice(0, POOL_OFFER_BARS);
}
