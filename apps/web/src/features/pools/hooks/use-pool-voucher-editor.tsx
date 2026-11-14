import type { OracleFeed } from "@clc/api/features/oracle-feeds/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  buildAddPoolVoucherCalls,
  buildRemovePoolVoucherCalls,
  findPoolVoucherFeed,
  POOL_PRICE_INDEX_DECIMALS,
  POOL_VOUCHER_CUSTOM_FEED,
  type PoolVoucherFeedInput,
  type PoolVoucherPricing,
  poolVoucherFeedSchema,
  poolVoucherUnitValueFromCap,
  poolVoucherRateSchema,
  resolvePoolVoucherFeedAddress,
  seedPoolVoucherFeedInput,
  seedPoolVoucherRateInput,
  toPoolVoucherFeedConfig,
  toPoolVoucherRateConfig,
  type PoolVoucherRateInput,
} from "@clc/core/features/pool-admin/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { BackendApiError } from "@clc/api/client/errors";
import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";
import { useApprovalSuggestions } from "#/features/pools/hooks/use-approval-suggestions";
import {
  poolAdminRelayMutationKey,
  usePoolAdminRelay,
} from "#/features/pools/hooks/use-pool-admin";
import {
  type OracleFeedRound,
  useOracleFeedRounds,
  useOracleFeeds,
  usePoolQuoterKind,
  usePoolVoucherOracles,
  usePoolVoucherRatesByAddress,
  type PoolQuoterKind,
} from "#/features/pools/hooks/use-pool-quoter";
import {
  poolTokenRegistryAddress,
  usePoolRegistryTokens,
  usePoolTokenMembership,
} from "#/features/pools/hooks/use-pool-registry";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";
import {
  type ApprovalCandidate,
  suggestApprovalVouchers,
  toApprovalCandidate,
} from "#/features/pools/logic/approval-suggestions";
import type { PoolApproveSeed } from "#/lib/navigation/pool-side";

/**
 * The voucher a steward is configuring, whichever screen they came from.
 *
 * Approving picks a catalog or balance row; managing starts from a row the
 * pool already holds. The current rate, cap, and balance are still read from
 * chain for either path. Reducing both to this shape keeps one form rather
 * than two.
 */
export type PoolVoucherEditorVoucher = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number | null;
};

/**
 * What the form is seeded with, by quoter. A RelativeQuoter takes a typed rate;
 * an OracleQuoter takes a feed, and its credit limit is in voucher units.
 */
export type PoolVoucherPricingSeed =
  | { kind: "relative"; values: PoolVoucherRateInput; ratePpm: string }
  | {
      kind: "oracle";
      values: PoolVoucherFeedInput;
      /** The aggregator `oracles(token)` returns now; null when none is set. */
      currentAggregator: `0x${string}` | null;
      /** The bound the quoter applies to that mapping: its own, or the global one. */
      currentMaxStalenessSeconds: number;
      /** The quoter's global bound, which a feed sent without one falls back to. */
      globalMaxStalenessSeconds: number;
      feeds: readonly OracleFeed[];
    };

/** Both field groups in one form: each quoter validates and writes only its own. */
type PoolVoucherFormValues = PoolVoucherRateInput & PoolVoucherFeedInput;

const poolVoucherFormShape = z.object({
  exchangeRate: z.string(),
  creditLimit: z.string(),
  feed: z.string(),
  customAddress: z.string(),
});

export type VoucherBalanceState =
  | { status: "loading" }
  | { status: "ready"; raw: string }
  | { status: "unavailable" };

/**
 * The steward's on-chain surface for one voucher in one pool: which voucher is
 * being configured, what the chain says about it, and whether it can be
 * configured at all. `voucher` null is the approve flow (pick one first); a
 * pool row is the manage flow for that voucher.
 *
 * Three separately owned contracts move together — the registry admits the
 * token, the limiter caps what the pool may hold of it, and the quoter learns
 * to price it — relayed as a single batch (see `usePoolVoucherConfiguration`).
 */
export function usePoolVoucherEditor({
  pool,
  voucher,
  approvedCatalog = [],
  approveSeed = null,
}: {
  pool: UserPool;
  voucher: PoolVoucher | null;
  /** The pool's catalog rows: a voucher already listed is already approved. */
  approvedCatalog?: readonly PoolVoucher[];
  /** A steward-approve link's voucher, rate and limit. The approve flow only. */
  approveSeed?: PoolApproveSeed | null;
}) {
  const { t } = useLingui();
  const quoter = usePoolQuoterKind(pool);
  const [picked, setPicked] = useState<ApprovalCandidate | null>(null);
  // The link's seeds until they are dropped: a different voucher picked, the
  // named one missing from the catalog, or already approved.
  const [seeds, setSeeds] = useState<PoolApproveSeed | null>(voucher ? null : approveSeed);
  const [candidateMissing, setCandidateMissing] = useState(false);
  const candidateAddress = !picked && seeds ? seeds.candidate : undefined;

  // Only the picked voucher's decimals are missing — a pool row already carries
  // them — so the detail is fetched once a voucher is chosen rather than for
  // every candidate in the search results. A link's candidate resolves through
  // the same read, which also supplies its name and symbol.
  const pickedDetail = useMarketVoucherDetail(picked?.address ?? candidateAddress);
  const candidateDetail = candidateAddress ? pickedDetail.data : undefined;
  const candidateError = candidateAddress && pickedDetail.isError ? pickedDetail.error : null;
  // The catalog answering that it does not know the address, as opposed to a
  // read that failed and may succeed on retry.
  const candidateUnknown =
    candidateError !== null &&
    (!(candidateError instanceof BackendApiError) || candidateError.kind === "not-found");
  useEffect(() => {
    if (!candidateAddress) return;
    if (candidateDetail) {
      const candidate = toApprovalCandidate({
        id: candidateDetail.address,
        address: candidateDetail.address,
        name: candidateDetail.name,
        symbol: candidateDetail.symbol,
      });
      if (candidate) {
        setPicked(candidate);
        return;
      }
    }
    if (candidateDetail || candidateUnknown) {
      setSeeds(null);
      setCandidateMissing(true);
    }
  }, [candidateAddress, candidateDetail, candidateUnknown]);

  /** Picking, or clearing, any voucher but the named one drops the link's seeds. */
  const choose = (next: ApprovalCandidate | null) => {
    if (next?.address !== seeds?.candidate) setSeeds(null);
    setCandidateMissing(false);
    setPicked(next);
  };
  const selected: PoolVoucherEditorVoucher | null = voucher
    ? {
        address: voucher.tokenAddress,
        name: voucher.name,
        symbol: voucher.symbol,
        decimals: voucher.decimals,
      }
    : picked
      ? {
          address: picked.address,
          name: picked.name,
          symbol: picked.symbol,
          decimals: pickedDetail.data?.decimals ?? null,
        }
      : null;

  // Whether to send `add` is the registry's answer, not the catalog's. A token
  // seeded when the pool was published, or one the indexer has not projected,
  // is already a member the catalog does not list — and `add` on a member
  // reverts `TokenAlreadyExists`, taking the rate and the limit with it.
  const membership = usePoolTokenMembership(pool, selected?.address);
  const membershipRequired = !voucher && poolTokenRegistryAddress(pool) !== null;
  const membershipPending = membershipRequired && membership.isPending;
  const membershipUnread = membershipRequired && membership.isError;
  // The registry is authoritative where there is one: the catalog can still list
  // a voucher just removed from it. Only a pool without a registry falls back to
  // the catalog's rows.
  const approvalAlreadyRegistered =
    !voucher &&
    (membershipRequired
      ? membership.data === true
      : selected !== null && approvedCatalog.some((row) => row.tokenAddress === selected.address));
  // Only register on a positive "not a member". An unread membership defaults to
  // not registering, because a redundant `add` reverts the whole batch while a
  // missing one merely leaves the voucher unlisted and re-approvable.
  const register = membershipRequired && membership.data === false;
  const registrationUnknown = membershipRequired && membership.data === undefined;
  const hasLimiter = pool.limiterAddress !== null;
  const unitSymbol = pool.unitOfAccount ?? pool.symbol;
  const canConfigure = POOL_QUOTER_SUPPORT[quoter.kind];
  const oracle = quoter.kind === "oracle";
  const ratesRead = canConfigure && !oracle;
  const selectedAddresses = selected ? [selected.address] : [];
  const rates = usePoolVoucherRatesByAddress(pool, selectedAddresses, !!selected && ratesRead, {
    failOnReadError: true,
  });
  const oracles = usePoolVoucherOracles(pool, selectedAddresses, !!selected && oracle);
  const feeds = useOracleFeeds(oracle);
  // A refetch that fails keeps the list it already had: only a list never read blocks.
  const feedList = feeds.data;
  const currentOracle = selected ? oracles.data?.get(selected.address.toLowerCase()) : undefined;
  const treasury = usePoolTreasury(pool, selectedAddresses, !!selected);
  const treasuryRow = selected ? treasury.data?.get(selected.address.toLowerCase()) : undefined;
  const currentRatePpm = selected ? rates.data?.get(selected.address.toLowerCase()) : undefined;
  const seedRatePpm = currentRatePpm?.toString() ?? null;
  const seedCapRaw = hasLimiter ? (treasuryRow?.limitRaw ?? null) : null;
  const decimalsPending = !!picked && pickedDetail.isPending;
  const decimalsUnread = !!selected && !decimalsPending && selected.decimals === null;
  const ratePending = !!selected && ratesRead && rates.isPending;
  const rateUnread = !!selected && ratesRead && !ratePending && !seedRatePpm;
  const oraclePending = !!selected && oracle && oracles.isPending;
  const oracleUnread = !!selected && oracle && !oraclePending && !currentOracle;
  const feedsPending = oracle && !feedList && feeds.isPending;
  const feedsUnread = oracle && !feedList && feeds.isError;
  const treasuryPending = !!selected && treasury.isPending;
  const capUnread = !!selected && hasLimiter && !treasuryPending && seedCapRaw === null;
  const blockedReason = quoter.isPending
    ? null
    : approvalAlreadyRegistered
      ? t`This voucher is already approved.`
      : membershipUnread
        ? t`Couldn't check which vouchers are already approved.`
        : !canConfigure
          ? quoterNotice(quoter.kind)
          : rateUnread
            ? t`Couldn't read this voucher's current rate, so it can't be changed right now.`
            : oracleUnread
              ? t`Couldn't read this voucher's current price feed, so it can't be changed right now.`
              : feedsUnread
                ? t`Couldn't load price feeds.`
                : capUnread
                  ? t`Couldn't load credit limits.`
                  : decimalsUnread
                    ? t`This voucher's decimals are unknown, so a limit can't be set.`
                    : null;
  const balance: VoucherBalanceState = !selected
    ? { status: "loading" }
    : decimalsPending || treasuryPending
      ? { status: "loading" }
      : treasuryRow
        ? { status: "ready", raw: treasuryRow.balanceRaw }
        : { status: "unavailable" };
  const retryReads = () => {
    if (ratesRead) void rates.refetch();
    if (oracle) void oracles.refetch();
    void treasury.refetch();
  };
  const retryingReads =
    (ratesRead && rates.isFetching) || (oracle && oracles.isFetching) || treasury.isFetching;
  const retryBlockedReads = () => {
    if (membershipUnread) void membership.refetch();
    if (feedsUnread) void feeds.refetch();
    if (rateUnread || oracleUnread || capUnread) retryReads();
  };
  const capReady = !hasLimiter || seedCapRaw !== null;
  const chainSeed =
    selected && seedRatePpm && capReady
      ? seedPoolVoucherRateInput({
          exchangeRatePpm: seedRatePpm,
          capRaw: seedCapRaw,
          decimals: selected.decimals,
        })
      : null;
  // A link's rate and limit replace the chain's only once every read the chain
  // seed waits on is in, so no block is lifted by them. They are relative-pool
  // figures: a link names no feed, so an oracle pool takes only its voucher.
  const seed =
    chainSeed && seeds && selected?.address === seeds.candidate
      ? applyApproveSeed(chainSeed, seeds, hasLimiter)
      : chainSeed;
  const pricingSeed: PoolVoucherPricingSeed | null = oracle
    ? selected && currentOracle && feedList && capReady
      ? {
          kind: "oracle",
          values: seedPoolVoucherFeedInput({
            aggregatorAddress: currentOracle.aggregatorAddress,
            feeds: feedList,
            capRaw: seedCapRaw,
            decimals: selected.decimals,
          }),
          currentAggregator: currentOracle.aggregatorAddress,
          currentMaxStalenessSeconds: Number(
            currentOracle.maxStalenessSeconds || currentOracle.globalMaxStalenessSeconds,
          ),
          globalMaxStalenessSeconds: Number(currentOracle.globalMaxStalenessSeconds),
          feeds: feedList,
        }
      : null
    : seed && seedRatePpm
      ? { kind: "relative", values: seed, ratePpm: seedRatePpm }
      : null;
  // A link never becomes a change to a live voucher: that stays a deliberate
  // `manage`.
  useEffect(() => {
    if (approvalAlreadyRegistered && seeds) setSeeds(null);
  }, [approvalAlreadyRegistered, seeds]);

  const configuring =
    selected &&
    pricingSeed &&
    canConfigure &&
    !quoter.isPending &&
    !membershipPending &&
    !ratePending &&
    !oraclePending &&
    !feedsPending &&
    !treasuryPending &&
    !blockedReason
      ? selected
      : null;

  return {
    quoter,
    picked,
    setPicked: choose,
    /**
     * A link's candidate: still resolving, unknown to the catalog (its seeds are
     * dropped), or unreadable (kept for a retry).
     */
    candidate: candidateAddress
      ? candidateError && !candidateUnknown
        ? ("unreadable" as const)
        : ("resolving" as const)
      : candidateMissing
        ? ("missing" as const)
        : null,
    retryCandidate: () => void pickedDetail.refetch(),
    retryingCandidate: !!candidateAddress && pickedDetail.isFetching,
    selected,
    membership,
    membershipPending,
    membershipUnread,
    register,
    registrationUnknown,
    hasLimiter,
    unitSymbol,
    seedRatePpm,
    seedCapRaw,
    decimalsPending,
    ratePending,
    rateUnread,
    oraclePending,
    oracleUnread,
    feedsPending,
    feedsUnread,
    retryingFeeds: feeds.isFetching,
    treasuryPending,
    capUnread,
    blockedReason,
    balance,
    retryReads,
    retryingReads,
    retryBlockedReads,
    pricingSeed,
    configuring,
  };
}

/**
 * The rate and limit form for a voucher whose chain state has been read, plus
 * removal. Save and Remove share one relay. TanStack Form takes
 * `defaultValues` once, so key the caller on the voucher address.
 */
export function usePoolVoucherConfiguration({
  pool,
  voucher,
  selected,
  pricingSeed: openingPricingSeed,
  seedCapRaw: openingCapRaw,
  hasLimiter,
  register,
  registrationUnknown,
  onClose,
}: {
  pool: UserPool;
  voucher: PoolVoucher | null;
  selected: PoolVoucherEditorVoucher;
  pricingSeed: PoolVoucherPricingSeed;
  seedCapRaw: string | null;
  hasLimiter: boolean;
  register: boolean;
  registrationUnknown: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay(pool);
  // Any batch for this pool, including one the other view started before a
  // phone/desktop swap: a second press would relay beside it.
  const inFlight = useIsMutating({ mutationKey: poolAdminRelayMutationKey(pool.address) }) > 0;
  // What the form was seeded with, held for the life of the form. The chain
  // reads behind the seed can refresh after it opens; comparing the steward's
  // untouched fields against a newer value would read them as edits and write
  // the older value back over it. Only a field the steward changed is written.
  const [{ pricingSeed, seedCapRaw }] = useState(() => ({
    pricingSeed: openingPricingSeed,
    seedCapRaw: openingCapRaw,
  }));
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  // Save and Remove share one relay; this says which of the two is waiting.
  const [removing, setRemoving] = useState(false);
  const saving = inFlight && !removing;
  const defaultValues: PoolVoucherFormValues =
    pricingSeed.kind === "relative"
      ? { ...pricingSeed.values, feed: "", customAddress: "" }
      : { ...pricingSeed.values, exchangeRate: "" };
  const form = useForm({
    defaultValues,
    validators: {
      // The whole form's shape, held to the active quoter's own rules only.
      onSubmit: poolVoucherFormShape.superRefine((value, ctx) => {
        const rules =
          pricingSeed.kind === "relative"
            ? poolVoucherRateSchema({ requireCreditLimit: hasLimiter })
            : poolVoucherFeedSchema({
                requireCreditLimit: hasLimiter,
                decimals: selected.decimals,
              });
        for (const issue of rules.safeParse(value).error?.issues ?? []) {
          ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
        }
      }),
    },
    onSubmit: async ({ value }) => {
      if (inFlight) return;
      if (hasLimiter && selected.decimals === null) {
        toast.error(t`This voucher's decimals are unknown, so a limit can't be set.`);
        return;
      }

      // New registrations deliberately write the displayed defaults. Existing
      // members write only genuine changes, avoiding a stale no-op overwrite.
      // An unchanged feed sends no quoter call, even when its registry bound has
      // moved since it was set.
      let config: { pricing: PoolVoucherPricing; depositCapRaw?: string };
      let rateChanged: boolean;
      if (pricingSeed.kind === "relative") {
        const rate = toPoolVoucherRateConfig({
          values: value,
          decimals: selected.decimals ?? 0,
          hasLimiter,
        });
        config = rate;
        rateChanged = register || rate.pricing.exchangeRatePpm !== pricingSeed.ratePpm;
      } else {
        const feed = toPoolVoucherFeedConfig({
          values: value,
          feeds: pricingSeed.feeds,
          decimals: selected.decimals ?? 0,
          hasLimiter,
        });
        config = feed;
        rateChanged = register || feed.pricing.aggregatorAddress !== pricingSeed.currentAggregator;
      }
      const capChanged =
        hasLimiter && (register || config.depositCapRaw !== (seedCapRaw ?? undefined));
      if (!register && !rateChanged && !capChanged) {
        toast.error(t`Nothing has changed.`);
        return;
      }

      try {
        const result = await relay.mutateAsync(
          buildAddPoolVoucherCalls({
            poolAddress: pool.address,
            tokenAddress: selected.address,
            registryAddress: pool.tokenRegistryAddress,
            limiterAddress: pool.limiterAddress,
            quoterAddress: pool.quoterAddress,
            register,
            ...(capChanged && config.depositCapRaw !== undefined
              ? { depositCapRaw: config.depositCapRaw }
              : {}),
            ...(rateChanged ? { pricing: config.pricing } : {}),
          }),
        );
        toast.success(
          voucher
            ? t`${selected.symbol} updated.`
            : t`${selected.symbol} approved for ${pool.name}.`,
          { description: formatVoucherAddress(result.txHash as `0x${string}`) },
        );
        onClose();
      } catch (error) {
        if (relay.reportError(error, t`The transaction failed.`)) onClose();
      }
    },
  });

  const remove = async () => {
    if (inFlight || !voucher) return;
    setRemoving(true);
    try {
      await relay.mutateAsync(
        buildRemovePoolVoucherCalls({
          tokenAddress: voucher.tokenAddress,
          registryAddress: pool.tokenRegistryAddress,
        }),
      );
      toast.success(t`${voucher.symbol} removed from ${pool.name}.`);
      onClose();
    } catch (error) {
      if (relay.reportError(error, t`The transaction failed.`)) onClose();
    } finally {
      setRemoving(false);
    }
  };

  const canSubmit = !registrationUnknown && !inFlight;

  return {
    form,
    inFlight,
    remove,
    confirmingRemoval,
    setConfirmingRemoval,
    removing,
    saving,
    canSubmit,
  };
}

/**
 * Before a search, offer unapproved vouchers the steward can name without
 * typing: wallet holdings first, then deposits waiting at this pool, then
 * vouchers they issued. The chain registry is authoritative; the complete
 * catalog list is used only for older pools without a registry contract.
 */
export function usePoolVoucherPicker({
  pool,
  approvedCatalog,
}: {
  pool: UserPool;
  approvedCatalog: PoolVoucher[];
}) {
  const [query, setQuery] = useState("");
  const search = useVoucherSearch(query, setQuery, true);
  const suggestions = useApprovalSuggestions(pool.address);
  const registryAddress = poolTokenRegistryAddress(pool);
  const registry = usePoolRegistryTokens(pool);
  const term = query.trim();
  const searching = term.length >= VOUCHER_SEARCH_MIN_CHARS;
  const registryReady = registryAddress === null || registry.isSuccess;
  const registryError = registryAddress !== null && registry.isError;
  // A real registry is authoritative in both directions. The complete catalog
  // is only the fallback for older pools with no registry contract at all.
  const approvedAddresses =
    registryAddress === null
      ? approvedCatalog.map((voucher) => voucher.tokenAddress)
      : (registry.data ?? []);
  const suggested = suggestApprovalVouchers({
    holdings: suggestions.holdings.rows,
    deposited: suggestions.deposited.rows,
    issued: suggestions.issued.rows,
    approvedAddresses,
  });
  const approved = new Set(approvedAddresses.map((address) => address.toLowerCase()));
  const results = search.results.flatMap((voucher) => {
    if (approved.has(voucher.address.toLowerCase())) return [];
    const candidate = toApprovalCandidate(voucher);
    return candidate ? [candidate] : [];
  });

  return {
    query,
    setQuery,
    search,
    suggestions,
    registry,
    term,
    searching,
    registryReady,
    registryError,
    suggested,
    results,
  };
}

/**
 * The chain seed with a link's rate and limit over it, each kept only when the
 * form's own schema accepts it; an invalid one keeps the chain value.
 */
function applyApproveSeed(
  chainSeed: PoolVoucherRateInput,
  seeds: PoolApproveSeed,
  hasLimiter: boolean,
): PoolVoucherRateInput {
  const candidate = {
    exchangeRate: seeds.exchangeRate ?? chainSeed.exchangeRate,
    creditLimit: hasLimiter ? (seeds.creditLimit ?? chainSeed.creditLimit) : chainSeed.creditLimit,
  };
  const result = poolVoucherRateSchema({ requireCreditLimit: hasLimiter }).safeParse(candidate);
  if (result.success) return candidate;
  const invalid = new Set(result.error.issues.map((issue) => issue.path[0]));
  return {
    exchangeRate: invalid.has("exchangeRate") ? chainSeed.exchangeRate : candidate.exchangeRate,
    creditLimit: invalid.has("creditLimit") ? chainSeed.creditLimit : candidate.creditLimit,
  };
}

/**
 * Which quoters this screen can configure.
 *
 * A map rather than a condition because the three quoters take genuinely
 * different inputs: each one with a UI arrives as an entry here plus its own
 * field group (a typed rate, a feed picker), not as another branch threaded
 * through the form. `false` is a quoter the protocol supports and this screen
 * does not yet.
 */
const POOL_QUOTER_SUPPORT: Record<PoolQuoterKind, boolean> = {
  relative: true,
  oracle: true,
  decimal: false,
  unknown: false,
};

function quoterNotice(kind: PoolQuoterKind) {
  if (kind === "decimal") {
    return (
      <Trans>
        This pool values every voucher equally, so there is no rate to set. Adding vouchers to it
        isn't available here yet.
      </Trans>
    );
  }
  return (
    <Trans>We couldn't tell how this pool prices vouchers, so it can't be changed here.</Trans>
  );
}

/** The cap the limiter would store, shown in the voucher's own units as it is typed. */
export function previewCap(
  exchangeRate: string,
  creditLimit: string,
  decimals: number | null,
): string {
  if (decimals === null) return "—";
  try {
    const config = toPoolVoucherRateConfig({
      values: { exchangeRate, creditLimit },
      decimals,
      hasLimiter: true,
    });
    return config.depositCapRaw ? formatTokenAmount(config.depositCapRaw, decimals, 2) : "—";
  } catch {
    return "—";
  }
}

/** The amount the pool holds of a voucher, and its value at the rate being typed. */
export function usePoolVoucherFigures(
  voucher: PoolVoucherEditorVoucher,
  balance: VoucherBalanceState,
  exchangeRate: string | null,
) {
  const { i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const amount =
    balance.status === "ready" && voucher.decimals !== null
      ? formatTokenAmountFixed(balance.raw, voucher.decimals, 2, locale)
      : null;
  let unitValue: string | null = null;
  if (balance.status === "ready" && voucher.decimals !== null && exchangeRate !== null) {
    try {
      const ratePpm = parseTokenAmount(exchangeRate.trim(), POOL_PRICE_INDEX_DECIMALS);
      if (BigInt(ratePpm) > 0n) {
        const valueRaw = poolVoucherUnitValueFromCap(balance.raw, ratePpm, voucher.decimals);
        unitValue = formatTokenAmountFixed(valueRaw, POOL_PRICE_INDEX_DECIMALS, 2, locale);
      }
    } catch {
      // An incomplete rate while editing is already explained by the field.
      // Keep the derived value blank rather than showing a stale calculation.
    }
  }

  return { amount, unitValue };
}

/** One entry in the feed select: a verified feed and its latest round. */
type PoolVoucherFeedChoice = {
  address: `0x${string}`;
  /** The pair as the feed describes it (`EUR / USD`), or the registry name. */
  label: string;
  round: OracleFeedRound | null;
};

/**
 * The feed select's options and the state of the feed the fields name.
 *
 * Rounds are read for every verified feed plus a custom address, so the price
 * beside each option is live. A custom address takes the quoter's global bound,
 * which is what the batch will send for it.
 */
export function usePoolVoucherFeedChoices(
  seed: Pick<
    Extract<PoolVoucherPricingSeed, { kind: "oracle" }>,
    "feeds" | "currentAggregator" | "currentMaxStalenessSeconds" | "globalMaxStalenessSeconds"
  >,
  values: Pick<PoolVoucherFeedInput, "feed" | "customAddress">,
) {
  const { feeds } = seed;
  const custom = values.feed === POOL_VOUCHER_CUSTOM_FEED;
  const customAddress = custom ? resolvePoolVoucherFeedAddress(values) : null;
  const unverified = customAddress !== null && !findPoolVoucherFeed(feeds, customAddress);
  // Stale by the bound the quoter would apply once this is saved. The current
  // feed is left alone by an unchanged save, so it keeps its own bound; any other
  // is sent with its registry bound, or none, which defers to the global one.
  const boundFor = (address: `0x${string}`) =>
    address === seed.currentAggregator
      ? seed.currentMaxStalenessSeconds
      : (findPoolVoucherFeed(feeds, address)?.maxStalenessSeconds ??
        seed.globalMaxStalenessSeconds);
  const rounds = useOracleFeedRounds(
    [
      ...feeds.map((feed) => feed.address),
      ...(customAddress && unverified ? [customAddress] : []),
    ].map((address) => ({ address, maxStalenessSeconds: boundFor(address) })),
    true,
  );
  const choices: PoolVoucherFeedChoice[] = feeds.map((feed) => ({
    address: feed.address,
    label: feed.description ?? feed.name,
    round: rounds.data?.get(feed.address) ?? null,
  }));
  const selectedAddress = resolvePoolVoucherFeedAddress(values);
  return {
    choices,
    custom,
    /** A valid typed address the registry does not list. */
    unverified,
    selected: choices.find((choice) => choice.address === selectedAddress) ?? null,
    customRound: customAddress ? (rounds.data?.get(customAddress) ?? null) : null,
    roundsPending: rounds.isPending && rounds.fetchStatus !== "idle",
  };
}
