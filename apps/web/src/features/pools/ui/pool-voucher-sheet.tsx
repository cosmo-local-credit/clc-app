import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  buildAddPoolVoucherCalls,
  buildRemovePoolVoucherCalls,
  poolVoucherRateSchema,
  seedPoolVoucherRateInput,
  toPoolVoucherRateConfig,
  type PoolVoucherRateInput,
} from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiDeleteBinLine, RiSearchLine } from "react-icons/ri";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SignHint } from "#/components/wallet";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import {
  useVoucherSearch,
  VOUCHER_SEARCH_MIN_CHARS,
} from "#/features/home/hooks/use-voucher-search";
import { useApprovalSuggestions } from "#/features/pools/hooks/use-approval-suggestions";
import { usePoolAdminRelay } from "#/features/pools/hooks/use-pool-admin";
import { usePoolQuoterKind, type PoolQuoterKind } from "#/features/pools/hooks/use-pool-quoter";
import { usePoolTokenMembership } from "#/features/pools/hooks/use-pool-registry";
import {
  type ApprovalCandidate,
  suggestApprovalVouchers,
  toApprovalCandidate,
} from "#/features/pools/logic/approval-suggestions";

/**
 * The voucher a steward is configuring, whichever screen they came from.
 *
 * Approving picks a catalog or balance row; managing starts
 * from a row the pool already holds, which carries its own decimals and cap.
 * Reducing both to this shape keeps one form rather than two.
 */
type SheetVoucher = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number | null;
  capRaw: string | null;
};

/**
 * The steward's on-chain surface for one voucher in one pool.
 *
 * Three separately owned contracts move together — the registry admits the
 * token, the limiter caps what the pool may hold of it, and the quoter learns to
 * price it — relayed as a single batch so a voucher is never admitted at a price
 * nobody chose. The calls are built by `@clc/core/features/pool-admin/logic` and
 * signed with whatever key this wallet holds.
 *
 * Only the pool's own owner reaches this. A superadmin can correct the catalog
 * record but is not the on-chain owner, and every call below is `onlyOwner`.
 */
export function PoolVoucherSheet({
  pool,
  poolVouchers,
  voucher,
  currentRatePpm,
  rateIsPending,
  open,
  onClose,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  /** Null opens the approve flow; a row opens the manage flow for that voucher. */
  voucher: PoolVoucher | null;
  /** The voucher's rate as the quoter holds it. Meaningful only while managing. */
  currentRatePpm: bigint | undefined;
  /** Whether that read is still in flight, so an absent rate is not read as parity. */
  rateIsPending: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
          <SheetHeader>
            <SheetTitle className="font-heading text-base font-semibold">
              {voucher ? <Trans>Manage voucher</Trans> : <Trans>Approve voucher</Trans>}
            </SheetTitle>
          </SheetHeader>
          {/* Mounted only while open so each visit reads the current rate and
              cap: TanStack Form takes defaultValues once. */}
          {open ? (
            <PoolVoucherForm
              pool={pool}
              poolVouchers={poolVouchers}
              voucher={voucher}
              currentRatePpm={currentRatePpm}
              rateIsPending={rateIsPending}
              onClose={onClose}
            />
          ) : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function PoolVoucherForm({
  pool,
  poolVouchers,
  voucher,
  currentRatePpm,
  rateIsPending,
  onClose,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  voucher: PoolVoucher | null;
  currentRatePpm: bigint | undefined;
  rateIsPending: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const quoter = usePoolQuoterKind(pool);
  const relay = usePoolAdminRelay();
  const [picked, setPicked] = useState<ApprovalCandidate | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  // Only the picked voucher's decimals are missing — a pool row already carries
  // them — so the detail is fetched once a voucher is chosen rather than for
  // every candidate in the search results.
  const pickedDetail = useMarketVoucherDetail(picked?.address);
  const selected: SheetVoucher | null = voucher
    ? {
        address: voucher.tokenAddress,
        name: voucher.name,
        symbol: voucher.symbol,
        decimals: voucher.decimals,
        capRaw: voucher.tokenLimit,
      }
    : picked
      ? {
          address: picked.address,
          name: picked.name,
          symbol: picked.symbol,
          decimals: pickedDetail.data?.decimals ?? null,
          capRaw: null,
        }
      : null;

  // Whether to send `add` is the registry's answer, not the catalog's. A token
  // seeded when the pool was published, or one the indexer has not projected,
  // is already a member the catalog does not list — and `add` on a member
  // reverts `TokenAlreadyExists`, taking the rate and the limit with it.
  const membership = usePoolTokenMembership(pool, selected?.address);
  const alreadyRegistered = membership.data === true;
  // Only register on a positive "not a member". An unread membership defaults to
  // not registering, because a redundant `add` reverts the whole batch while a
  // missing one merely leaves the voucher unlisted and re-approvable.
  const register = !voucher && membership.data === false;
  const registrationUnknown = !voucher && membership.data === undefined;
  const hasLimiter = pool.limiterAddress !== null;
  const unitSymbol = pool.unitOfAccount ?? pool.symbol;
  // Only meaningful when a rate was actually read. Defaulting an unread rate to
  // parity would seed the form with a number the quoter never held, and saving
  // would write it — so an unread rate blocks the fields instead.
  const seedRatePpm = currentRatePpm?.toString() ?? null;
  const seed: PoolVoucherRateInput =
    voucher && seedRatePpm
      ? seedPoolVoucherRateInput({
          exchangeRatePpm: seedRatePpm,
          capRaw: voucher.tokenLimit,
          decimals: voucher.decimals,
        })
      : APPROVAL_DEFAULTS;

  const form = useForm({
    defaultValues: seed,
    validators: { onSubmit: poolVoucherRateSchema({ requireCreditLimit: hasLimiter }) },
    onSubmit: async ({ value }) => {
      if (!selected) return;
      if (voucher && !seedRatePpm) return;
      if (hasLimiter && selected.decimals === null) {
        toast.error(t`This voucher's decimals are unknown, so a limit can't be set.`);
        return;
      }

      const config = toPoolVoucherRateConfig({
        values: value,
        decimals: selected.decimals ?? 0,
        hasLimiter,
      });
      // An edit re-signs only what moved. Writing the rate back unchanged would
      // race anyone else who repriced it, and re-registering an existing member
      // reverts `TokenAlreadyExists`, taking the rest of the batch with it.
      const rateChanged = !voucher || config.pricing.exchangeRatePpm !== seedRatePpm;
      const capChanged = !voucher || config.depositCapRaw !== (voucher.tokenLimit ?? undefined);
      if (voucher && !rateChanged && !capChanged) {
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
        toast.error(error instanceof Error ? error.message : t`The transaction failed.`);
      }
    },
  });

  const remove = async () => {
    if (!voucher) return;
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
      toast.error(error instanceof Error ? error.message : t`The transaction failed.`);
    }
  };

  const canConfigure = POOL_QUOTER_SUPPORT[quoter.kind];
  const rateUnread = !!voucher && !rateIsPending && !seedRatePpm;
  const blockedReason = quoter.isPending
    ? null
    : !canConfigure
      ? quoterNotice(quoter.kind)
      : rateUnread
        ? t`Couldn't read this voucher's current rate, so it can't be changed right now.`
        : null;
  const decimalsPending = !!picked && pickedDetail.isPending;
  // Narrowed to the voucher rather than kept as a flag, so the field group below
  // reads its symbol and decimals off the same value that decided to render it.
  const configuring: SheetVoucher | null =
    selected && canConfigure && !rateUnread && !(voucher && rateIsPending) ? selected : null;
  const canSubmit =
    !!configuring &&
    !quoter.isPending &&
    !decimalsPending &&
    !registrationUnknown &&
    !relay.isPending;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        {selected ? (
          <SelectedVoucher
            voucher={selected}
            loadingDecimals={decimalsPending}
            onChange={voucher ? undefined : () => setPicked(null)}
          />
        ) : (
          <VoucherPicker excluded={poolVouchers} onSelect={setPicked} />
        )}

        {quoter.isPending ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Checking how this pool prices vouchers…</Trans>
          </p>
        ) : null}

        {voucher && canConfigure && rateIsPending ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Reading the current rate…</Trans>
          </p>
        ) : null}

        {!voucher && alreadyRegistered ? (
          <p className="border border-border bg-card p-4 text-muted-foreground text-xs">
            <Trans>
              This pool already allows {selected?.symbol}. Saving updates its rate and limit instead
              of adding it again.
            </Trans>
          </p>
        ) : null}

        {blockedReason ? (
          <p role="alert" className="border border-border bg-card p-4 text-destructive text-xs">
            {blockedReason}
          </p>
        ) : null}

        {configuring ? (
          <>
            <form.Field name="exchangeRate">
              {(field) => (
                <RateRow
                  id="pool-voucher-rate"
                  heading={t`Exchange rate`}
                  leading={`1 ${configuring.symbol}`}
                  unitSymbol={unitSymbol}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  error={getFieldError(field.state.meta.errors)}
                  hint={t`Exchange rate relative to the default voucher (${unitSymbol})`}
                  placeholder="1"
                />
              )}
            </form.Field>

            {hasLimiter ? (
              <form.Subscribe selector={(state) => state.values.exchangeRate}>
                {(exchangeRate) => (
                  <form.Field name="creditLimit">
                    {(field) => (
                      <RateRow
                        id="pool-voucher-limit"
                        heading={t`Credit limit`}
                        leading={`${previewCap(exchangeRate, field.state.value, configuring.decimals)} ${configuring.symbol}`}
                        unitSymbol={unitSymbol}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        error={getFieldError(field.state.meta.errors)}
                        hint={t`How much value in ${unitSymbol} can be swapped from the pool using ${configuring.symbol} vouchers? Zero accepts no deposits yet.`}
                        placeholder="0"
                      />
                    )}
                  </form.Field>
                )}
              </form.Subscribe>
            ) : (
              <p className="border border-border bg-card p-4 text-muted-foreground text-xs">
                <Trans>
                  This pool has no limiter, so deposits are uncapped and no credit limit can be set.
                </Trans>
              </p>
            )}
          </>
        ) : null}

        {voucher ? (
          <div className="border-t border-border pt-4">
            {confirmingRemoval ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  <Trans>
                    Removing {voucher.symbol} stops it being swapped in or out of this pool. Its
                    rate and limit are kept.
                  </Trans>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11 flex-1"
                    disabled={relay.isPending}
                    onClick={() => void remove()}
                  >
                    <Trans>Remove</Trans>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 bg-card"
                    disabled={relay.isPending}
                    onClick={() => setConfirmingRemoval(false)}
                  >
                    <Trans>Keep</Trans>
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="destructive"
                className="h-11 w-full"
                disabled={relay.isPending}
                onClick={() => setConfirmingRemoval(true)}
              >
                <RiDeleteBinLine className="size-4" aria-hidden="true" />
                <Trans>Remove from pool</Trans>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <SheetFooter>
        <SignHint className="bg-card" />
        <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
          {relay.isPending ? (
            <Trans>Waiting for the chain…</Trans>
          ) : voucher ? (
            <Trans>Save changes</Trans>
          ) : (
            <Trans>Approve voucher</Trans>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full bg-card"
          disabled={relay.isPending}
          onClick={onClose}
        >
          <Trans>Cancel</Trans>
        </Button>
      </SheetFooter>
    </form>
  );
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
/**
 * What a new voucher starts at: parity, and a limit of nothing.
 *
 * Parity because it is the only rate that asserts nothing about the voucher, and
 * zero because the limiter takes it and it is the cautious half of the pair —
 * approving a voucher is a separate decision from deciding how much of it the
 * pool will hold, and the steward makes the second one deliberately rather than
 * by leaving a suggested number in place.
 */
const APPROVAL_DEFAULTS: PoolVoucherRateInput = { exchangeRate: "1", creditLimit: "0" };

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
function previewCap(exchangeRate: string, creditLimit: string, decimals: number | null): string {
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

/**
 * `{leading} = [input] {unit}` — the equation the steward is actually setting,
 * rather than a bare number field whose units they would have to remember.
 */
function RateRow({
  id,
  heading,
  leading,
  unitSymbol,
  value,
  onChange,
  onBlur,
  error,
  hint,
  placeholder,
}: {
  id: string;
  heading: string;
  leading: string;
  unitSymbol: string;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  error: string | null;
  hint: string;
  placeholder: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="mb-3 font-medium text-muted-foreground text-xs">{heading}</p>
      <div className="flex items-center gap-2">
        <span className="shrink-0 truncate font-mono text-sm font-semibold">{leading}</span>
        <span className="shrink-0 text-muted-foreground text-sm">=</span>
        <label htmlFor={id} className="sr-only">
          {heading}
        </label>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          className="min-w-0 flex-1 font-mono"
        />
        <span className="shrink-0 font-mono text-sm font-semibold">{unitSymbol}</span>
      </div>
      {error ? (
        <FieldError error={error} />
      ) : (
        <p className="mt-2 text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}

function SelectedVoucher({
  voucher,
  loadingDecimals,
  onChange,
}: {
  voucher: SheetVoucher;
  loadingDecimals: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate font-bold text-sm tracking-tight">{voucher.name}</p>
        <p className="font-mono text-muted-foreground text-xs">{voucher.symbol}</p>
        <p className="mt-1 font-mono text-muted-foreground text-xs">
          {formatVoucherAddress(voucher.address)}
          {loadingDecimals ? " · …" : voucher.decimals === null ? "" : ` · ${voucher.decimals} dp`}
        </p>
      </div>
      {onChange ? (
        <Button type="button" variant="outline" size="sm" className="bg-card" onClick={onChange}>
          <Trans>Change</Trans>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Before a search, offer the vouchers a steward can name without typing:
 * ones they issued, ones they hold, and ones this pool already allows.
 *
 * Search stays the way to reach every other voucher. Pool members stay out of
 * those results — `TokenUniqueSymbolIndex.add` reverts on a token the registry
 * holds, which would take the rate and limit in the same batch — but they stay
 * in the idle list, because choosing one updates the rate and limit instead.
 */
function VoucherPicker({
  excluded,
  onSelect,
}: {
  excluded: PoolVoucher[];
  onSelect: (voucher: ApprovalCandidate) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const search = useVoucherSearch(query, setQuery, true);
  const suggestions = useApprovalSuggestions();
  const term = query.trim();
  const searching = term.length >= VOUCHER_SEARCH_MIN_CHARS;
  const inPool = excluded.flatMap((voucher) => {
    const candidate = toApprovalCandidate({
      id: voucher.id,
      address: voucher.tokenAddress,
      name: voucher.name,
      symbol: voucher.symbol,
    });
    return candidate ? [candidate] : [];
  });
  const suggested = suggestApprovalVouchers({
    issued: suggestions.isPending ? [] : suggestions.issued,
    holdings: suggestions.isPending ? [] : suggestions.holdings,
    inPool,
  });
  const held = new Set(inPool.map((voucher) => voucher.address.toLowerCase()));
  const results = search.results.flatMap((voucher) => {
    if (held.has(voucher.address.toLowerCase())) return [];
    const candidate = toApprovalCandidate(voucher);
    return candidate ? [candidate] : [];
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <RiSearchLine
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label={t`Search vouchers`}
          placeholder={t`Name, symbol or address`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>

      {term.length > 0 && !searching ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Type at least two characters.</Trans>
        </p>
      ) : null}

      {searching ? (
        <SearchResults search={search} results={results} onSelect={onSelect} />
      ) : (
        <SuggestionLists
          suggested={suggested}
          pending={suggestions.isPending}
          failed={suggestions.isError}
          onRetry={suggestions.refetch}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function SearchResults({
  search,
  results,
  onSelect,
}: {
  search: ReturnType<typeof useVoucherSearch>;
  results: readonly ApprovalCandidate[];
  onSelect: (voucher: ApprovalCandidate) => void;
}) {
  return (
    <div className="space-y-2">
      {search.status === "searching" ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Searching…</Trans>
        </p>
      ) : null}

      {search.status === "error" ? (
        <div className="space-y-2">
          <p role="alert" className="text-destructive text-sm">
            <Trans>Couldn't search vouchers.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={search.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {search.status === "ready" && results.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          <Trans>No vouchers match that search.</Trans>
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="max-h-64 overflow-y-auto">
          <CandidateList candidates={results} onSelect={onSelect} />
        </div>
      ) : null}
    </div>
  );
}

function SuggestionLists({
  suggested,
  pending,
  failed,
  onRetry,
  onSelect,
}: {
  suggested: ReturnType<typeof suggestApprovalVouchers>;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  onSelect: (voucher: ApprovalCandidate) => void;
}) {
  const groups = [
    { id: "issued", label: <Trans>Vouchers you issued</Trans>, rows: suggested.issued },
    { id: "holdings", label: <Trans>Vouchers you hold</Trans>, rows: suggested.holdings },
    { id: "pool", label: <Trans>In this pool</Trans>, rows: suggested.inPool },
  ].filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-3">
      {pending ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Loading vouchers…</Trans>
        </p>
      ) : null}
      {failed ? (
        <div className="space-y-2">
          <p role="alert" className="text-destructive text-sm">
            <Trans>Couldn't load vouchers.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={onRetry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`approve-${group.id}`} className="space-y-1">
          <p id={`approve-${group.id}`} className="text-muted-foreground text-xs">
            {group.label}
          </p>
          <CandidateList candidates={group.rows} onSelect={onSelect} />
        </section>
      ))}
    </div>
  );
}

function CandidateList({
  candidates,
  onSelect,
}: {
  candidates: readonly ApprovalCandidate[];
  onSelect: (voucher: ApprovalCandidate) => void;
}) {
  return (
    <ul className="border border-border bg-card">
      {candidates.map((voucher, index) => (
        <li key={voucher.address}>
          <button
            type="button"
            onClick={() => onSelect(voucher)}
            className={[
              "flex w-full items-center gap-3 p-3 text-left",
              index === candidates.length - 1 ? "" : "border-b border-border",
            ].join(" ")}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-sm tracking-tight">
                {voucher.name}
              </span>
              <span className="block font-mono text-muted-foreground text-xs">
                {formatVoucherAddress(voucher.address)}
              </span>
            </span>
            <Badge variant="outline" className="shrink-0 font-mono text-[0.625rem]">
              {voucher.symbol}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
