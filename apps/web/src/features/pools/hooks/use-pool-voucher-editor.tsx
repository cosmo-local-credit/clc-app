import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  buildAddPoolVoucherCalls,
  buildRemovePoolVoucherCalls,
  POOL_PRICE_INDEX_DECIMALS,
  poolVoucherUnitValueFromCap,
  poolVoucherRateSchema,
  seedPoolVoucherRateInput,
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
import { useState } from "react";
import { toast } from "sonner";

import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";
import { useApprovalSuggestions } from "#/features/pools/hooks/use-approval-suggestions";
import { usePoolAdminRelay } from "#/features/pools/hooks/use-pool-admin";
import {
  usePoolQuoterKind,
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
}: {
  pool: UserPool;
  voucher: PoolVoucher | null;
}) {
  const { t } = useLingui();
  const quoter = usePoolQuoterKind(pool);
  const [picked, setPicked] = useState<ApprovalCandidate | null>(null);

  // Only the picked voucher's decimals are missing — a pool row already carries
  // them — so the detail is fetched once a voucher is chosen rather than for
  // every candidate in the search results.
  const pickedDetail = useMarketVoucherDetail(picked?.address);
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
  const approvalAlreadyRegistered = !voucher && membership.data === true;
  // Only register on a positive "not a member". An unread membership defaults to
  // not registering, because a redundant `add` reverts the whole batch while a
  // missing one merely leaves the voucher unlisted and re-approvable.
  const register = membershipRequired && membership.data === false;
  const registrationUnknown = membershipRequired && membership.data === undefined;
  const hasLimiter = pool.limiterAddress !== null;
  const unitSymbol = pool.unitOfAccount ?? pool.symbol;
  const canConfigure = POOL_QUOTER_SUPPORT[quoter.kind];
  const selectedAddresses = selected ? [selected.address] : [];
  const rates = usePoolVoucherRatesByAddress(pool, selectedAddresses, !!selected && canConfigure, {
    failOnReadError: true,
  });
  const treasury = usePoolTreasury(pool, selectedAddresses, !!selected);
  const treasuryRow = selected ? treasury.data?.get(selected.address.toLowerCase()) : undefined;
  const currentRatePpm = selected ? rates.data?.get(selected.address.toLowerCase()) : undefined;
  const seedRatePpm = currentRatePpm?.toString() ?? null;
  const seedCapRaw = hasLimiter ? (treasuryRow?.limitRaw ?? null) : null;
  const decimalsPending = !!picked && pickedDetail.isPending;
  const decimalsUnread = !!selected && !decimalsPending && selected.decimals === null;
  const ratePending = !!selected && canConfigure && rates.isPending;
  const rateUnread = !!selected && canConfigure && !ratePending && !seedRatePpm;
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
    if (canConfigure) void rates.refetch();
    void treasury.refetch();
  };
  const retryingReads = (canConfigure && rates.isFetching) || treasury.isFetching;
  const retryBlockedReads = () => {
    if (membershipUnread) void membership.refetch();
    if (rateUnread || capUnread) retryReads();
  };
  const seed =
    selected && seedRatePpm && (!hasLimiter || seedCapRaw !== null)
      ? seedPoolVoucherRateInput({
          exchangeRatePpm: seedRatePpm,
          capRaw: seedCapRaw,
          decimals: selected.decimals,
        })
      : null;
  const configuring =
    selected &&
    seed &&
    canConfigure &&
    !quoter.isPending &&
    !membershipPending &&
    !ratePending &&
    !treasuryPending &&
    !blockedReason
      ? selected
      : null;

  return {
    quoter,
    picked,
    setPicked,
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
    treasuryPending,
    capUnread,
    blockedReason,
    balance,
    retryReads,
    retryingReads,
    retryBlockedReads,
    seed,
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
  seed,
  seedRatePpm,
  seedCapRaw,
  hasLimiter,
  register,
  registrationUnknown,
  onClose,
}: {
  pool: UserPool;
  voucher: PoolVoucher | null;
  selected: PoolVoucherEditorVoucher;
  seed: PoolVoucherRateInput;
  seedRatePpm: string;
  seedCapRaw: string | null;
  hasLimiter: boolean;
  register: boolean;
  registrationUnknown: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const relay = usePoolAdminRelay(pool);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  // Save and Remove share one relay; this says which of the two is waiting.
  const [removing, setRemoving] = useState(false);
  const saving = relay.isPending && !removing;
  const form = useForm({
    defaultValues: seed,
    validators: { onSubmit: poolVoucherRateSchema({ requireCreditLimit: hasLimiter }) },
    onSubmit: async ({ value }) => {
      if (hasLimiter && selected.decimals === null) {
        toast.error(t`This voucher's decimals are unknown, so a limit can't be set.`);
        return;
      }

      const config = toPoolVoucherRateConfig({
        values: value,
        decimals: selected.decimals ?? 0,
        hasLimiter,
      });
      // New registrations deliberately write the displayed defaults. Existing
      // members write only genuine changes, avoiding a stale no-op overwrite.
      const rateChanged = register || config.pricing.exchangeRatePpm !== seedRatePpm;
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
    if (!voucher) return;
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

  const canSubmit = !registrationUnknown && !relay.isPending;

  return {
    form,
    relay,
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
 * Which quoters this screen can configure.
 *
 * A map rather than a condition because the three quoters take genuinely
 * different inputs, and the next one to get a UI — an oracle feed picker, say —
 * should arrive as an entry here plus its own field group, not as another
 * branch threaded through the form. `false` is a quoter the protocol supports
 * and this screen does not yet.
 */
const POOL_QUOTER_SUPPORT: Record<PoolQuoterKind, boolean> = {
  relative: true,
  oracle: false,
  decimal: false,
  unknown: false,
};

function quoterNotice(kind: PoolQuoterKind) {
  if (kind === "oracle") {
    return (
      <Trans>This pool prices from a live feed. Feed settings aren't editable here yet.</Trans>
    );
  }
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
