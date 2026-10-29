import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  POOL_PRICE_INDEX_DECIMALS,
  type PoolVoucherRateInput,
} from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { RiDeleteBinLine, RiSearchLine } from "react-icons/ri";

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
import type { useVoucherSearch } from "#/features/home/hooks/use-voucher-search";
import type { ApprovalSuggestionSource } from "#/features/pools/hooks/use-approval-suggestions";
import {
  previewCap,
  type PoolVoucherEditorVoucher,
  usePoolVoucherConfiguration,
  usePoolVoucherEditor,
  usePoolVoucherFigures,
  usePoolVoucherPicker,
  type VoucherBalanceState,
} from "#/features/pools/hooks/use-pool-voucher-editor";
import type {
  ApprovalCandidate,
  suggestApprovalVouchers,
} from "#/features/pools/logic/approval-suggestions";

/**
 * The steward's on-chain surface for one voucher in one pool.
 *
 * Three separately owned contracts move together — the registry admits the
 * token, the limiter caps what the pool may hold of it, and the quoter learns to
 * price it — relayed as a single batch so a voucher is never admitted at a price
 * nobody chose. The calls are built by `@clc/core/features/pool-admin/logic` and
 * signed with whatever key this wallet holds.
 *
 * Only the pool's own owner reaches this. An administrator can correct the catalog
 * record but is not the on-chain owner, and every call below is `onlyOwner`.
 */
export function PoolVoucherSheet({
  pool,
  poolVouchers,
  voucher,
  open,
  onClose,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  /** Null opens the approve flow; a row opens the manage flow for that voucher. */
  voucher: PoolVoucher | null;
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
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
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
  onClose,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  voucher: PoolVoucher | null;
  onClose: () => void;
}) {
  const editor = usePoolVoucherEditor({ pool, voucher });
  const {
    quoter,
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
  } = editor;
  if (configuring && seed && seedRatePpm) {
    return (
      <PoolVoucherConfigurationForm
        key={configuring.address}
        pool={pool}
        voucher={voucher}
        selected={configuring}
        seed={seed}
        seedRatePpm={seedRatePpm}
        seedCapRaw={seedCapRaw}
        hasLimiter={hasLimiter}
        unitSymbol={unitSymbol}
        balance={balance}
        register={register}
        registrationUnknown={registrationUnknown}
        onRetryReads={retryReads}
        retryingReads={retryingReads}
        onChange={voucher ? undefined : () => setPicked(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        {selected ? (
          <SelectedVoucher
            voucher={selected}
            unitSymbol={unitSymbol}
            exchangeRate={
              seedRatePpm
                ? formatTokenAmount(
                    seedRatePpm,
                    POOL_PRICE_INDEX_DECIMALS,
                    POOL_PRICE_INDEX_DECIMALS,
                  )
                : null
            }
            balance={balance}
            onRetry={retryReads}
            retrying={retryingReads}
            loadingDecimals={decimalsPending}
            onChange={voucher ? undefined : () => setPicked(null)}
          />
        ) : (
          <VoucherPicker pool={pool} approvedCatalog={poolVouchers} onSelect={setPicked} />
        )}

        {quoter.isPending ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Checking how this pool prices vouchers…</Trans>
          </p>
        ) : null}
        {membershipPending ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Checking approved vouchers…</Trans>
          </p>
        ) : null}
        {ratePending ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Reading the current rate…</Trans>
          </p>
        ) : null}
        {treasuryPending ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Reading the pool's balance…</Trans>
          </p>
        ) : null}
        {blockedReason ? (
          <div className="space-y-2 border border-border bg-card p-4">
            <p role="alert" className="text-destructive text-xs">
              {blockedReason}
            </p>
            {(membershipUnread || rateUnread || capUnread) && selected ? (
              <Button
                type="button"
                variant="outline"
                tap
                pending={membership.isFetching || retryingReads}
                onClick={retryBlockedReads}
              >
                <Trans>Retry</Trans>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <SheetFooter>
        <Button type="button" tap className="w-full" disabled>
          {voucher ? <Trans>Save changes</Trans> : <Trans>Approve voucher</Trans>}
        </Button>
        <Button type="button" variant="outline" tap className="w-full" onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
      </SheetFooter>
    </div>
  );
}

function PoolVoucherConfigurationForm({
  pool,
  voucher,
  selected,
  seed,
  seedRatePpm,
  seedCapRaw,
  hasLimiter,
  unitSymbol,
  balance,
  register,
  registrationUnknown,
  onRetryReads,
  retryingReads,
  onChange,
  onClose,
}: {
  pool: UserPool;
  voucher: PoolVoucher | null;
  selected: PoolVoucherEditorVoucher;
  seed: PoolVoucherRateInput;
  seedRatePpm: string;
  seedCapRaw: string | null;
  hasLimiter: boolean;
  unitSymbol: string;
  balance: VoucherBalanceState;
  register: boolean;
  registrationUnknown: boolean;
  onRetryReads: () => void;
  retryingReads: boolean;
  onChange?: () => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const {
    form,
    relay,
    remove,
    confirmingRemoval,
    setConfirmingRemoval,
    removing,
    saving,
    canSubmit,
  } = usePoolVoucherConfiguration({
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
  });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <form.Subscribe selector={(state) => state.values.exchangeRate}>
          {(exchangeRate) => (
            <SelectedVoucher
              voucher={selected}
              unitSymbol={unitSymbol}
              exchangeRate={exchangeRate}
              balance={balance}
              onRetry={onRetryReads}
              retrying={retryingReads}
              loadingDecimals={false}
              onChange={onChange}
            />
          )}
        </form.Subscribe>

        <form.Field name="exchangeRate">
          {(field) => (
            <RateRow
              id="pool-voucher-rate"
              heading={t`Exchange rate`}
              leading={`1 ${selected.symbol}`}
              unitSymbol={unitSymbol}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={getFieldError(field.state.meta.errors)}
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
                    leading={`${previewCap(exchangeRate, field.state.value, selected.decimals)} ${selected.symbol}`}
                    unitSymbol={unitSymbol}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    error={getFieldError(field.state.meta.errors)}
                    hint={t`How much value in ${unitSymbol} can be swapped from the pool using ${selected.symbol} vouchers?`}
                    placeholder="0"
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
        ) : (
          <p className="border border-border bg-card p-4 text-muted-foreground text-sm">
            <Trans>
              This pool has no limiter, so deposits are uncapped and no credit limit can be set.
            </Trans>
          </p>
        )}

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
                    tap
                    className="flex-1"
                    disabled={relay.isPending}
                    pending={removing}
                    onClick={() => void remove()}
                  >
                    <Trans>Remove</Trans>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    tap
                    className="flex-1"
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
                tap
                className="w-full"
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
        <Button type="submit" tap className="w-full" disabled={!canSubmit} pending={saving}>
          {saving ? (
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
          tap
          className="w-full"
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
  hint?: string;
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
          dir="ltr"
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
      ) : hint ? (
        <p className="mt-2 text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function SelectedVoucher({
  voucher,
  unitSymbol,
  exchangeRate,
  balance,
  onRetry,
  retrying,
  loadingDecimals,
  onChange,
}: {
  voucher: PoolVoucherEditorVoucher;
  unitSymbol: string;
  exchangeRate: string | null;
  balance: VoucherBalanceState;
  onRetry: () => void;
  retrying: boolean;
  loadingDecimals: boolean;
  onChange?: () => void;
}) {
  const { amount, unitValue } = usePoolVoucherFigures(voucher, balance, exchangeRate);

  return (
    <div className="border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm">{voucher.name}</p>
          <p dir="ltr" className="font-mono text-muted-foreground text-xs">
            {voucher.symbol}
          </p>
          <p dir="ltr" className="mt-1 font-mono text-muted-foreground text-xs">
            {formatVoucherAddress(voucher.address)}
            {loadingDecimals
              ? " · …"
              : voucher.decimals === null
                ? ""
                : ` · ${voucher.decimals} dp`}
          </p>
        </div>
        {onChange ? (
          <Button type="button" variant="outline" tap onClick={onChange}>
            <Trans>Change</Trans>
          </Button>
        ) : null}
      </div>

      <dl className="mt-3 divide-y divide-border border-t border-border">
        <div className="flex items-center justify-between gap-3 py-2 text-xs">
          <dt className="text-muted-foreground">
            <Trans>Amount in pool</Trans>
          </dt>
          <dd dir="ltr" className="text-end font-mono font-semibold">
            {balance.status === "loading" ? (
              <Trans>Reading…</Trans>
            ) : amount === null ? (
              <Trans>Unavailable</Trans>
            ) : (
              `${amount} ${voucher.symbol}`
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2 text-xs">
          <dt className="text-muted-foreground">
            <Trans>Value in {unitSymbol}</Trans>
          </dt>
          <dd dir="ltr" className="text-end font-mono font-semibold">
            {balance.status === "loading" ? (
              <Trans>Reading…</Trans>
            ) : unitValue === null ? (
              <Trans>Unavailable</Trans>
            ) : (
              `${unitValue} ${unitSymbol}`
            )}
          </dd>
        </div>
      </dl>

      {balance.status === "unavailable" ? (
        <Button
          type="button"
          variant="outline"
          tap
          className="mt-2"
          pending={retrying}
          onClick={onRetry}
        >
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Before a search, offer unapproved vouchers the steward can name without
 * typing: wallet holdings first, then deposits waiting at this pool, then
 * vouchers they issued. The chain registry is authoritative; the complete
 * catalog list is used only for older pools without a registry contract.
 */
function VoucherPicker({
  pool,
  approvedCatalog,
  onSelect,
}: {
  pool: UserPool;
  approvedCatalog: PoolVoucher[];
  onSelect: (voucher: ApprovalCandidate) => void;
}) {
  const { t } = useLingui();
  const {
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
  } = usePoolVoucherPicker({ pool, approvedCatalog });

  return (
    <div className="space-y-3">
      <div className="relative">
        <RiSearchLine
          className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label={t`Search vouchers`}
          placeholder={t`Name, symbol or address`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="ps-9"
        />
      </div>

      {term.length > 0 && !searching ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Type at least two characters.</Trans>
        </p>
      ) : null}

      {!registryReady && !registryError ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Checking approved vouchers…</Trans>
        </p>
      ) : null}

      {registryError ? (
        <div className="space-y-2">
          <p role="alert" className="text-destructive text-sm">
            <Trans>Couldn't check which vouchers are already approved.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            pending={registry.isFetching}
            onClick={() => void registry.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : registryReady && searching ? (
        <SearchResults search={search} results={results} onSelect={onSelect} />
      ) : registryReady ? (
        <SuggestionLists suggested={suggested} sources={suggestions} onSelect={onSelect} />
      ) : null}
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
            tap
            pending={search.retrying}
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
  sources,
  onSelect,
}: {
  suggested: ReturnType<typeof suggestApprovalVouchers>;
  sources: {
    issued: ApprovalSuggestionSource;
    holdings: ApprovalSuggestionSource;
    deposited: ApprovalSuggestionSource;
  };
  onSelect: (voucher: ApprovalCandidate) => void;
}) {
  const groups = [
    {
      id: "holdings",
      label: <Trans>Vouchers you hold</Trans>,
      rows: suggested.holdings,
      source: sources.holdings,
    },
    {
      id: "deposited",
      label: <Trans>Deposited in this pool</Trans>,
      rows: suggested.deposited,
      source: sources.deposited,
    },
    {
      id: "issued",
      label: <Trans>Vouchers you issued</Trans>,
      rows: suggested.issued,
      source: sources.issued,
    },
  ].filter(
    (group) =>
      group.rows.length > 0 ||
      group.source?.status === "loading" ||
      group.source?.status === "error" ||
      group.source?.completeness === "partial",
  );

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`approve-${group.id}`} className="space-y-1">
          <p id={`approve-${group.id}`} className="text-muted-foreground text-xs">
            {group.label}
          </p>
          {group.rows.length > 0 ? (
            <CandidateList candidates={group.rows} onSelect={onSelect} />
          ) : group.source?.status === "loading" ? (
            <p className="text-muted-foreground text-xs">
              <Trans>Loading…</Trans>
            </p>
          ) : group.source?.status === "error" ? (
            <div className="flex items-center justify-between gap-2">
              <p role="status" className="text-muted-foreground text-xs">
                <Trans>Unavailable</Trans>
              </p>
              <Button
                type="button"
                variant="outline"
                tap
                pending={group.source.retrying}
                onClick={group.source.retry}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}
          {group.source?.status === "ready" && group.source.completeness === "partial" ? (
            <div className="flex items-center justify-between gap-2">
              <p role="status" className="text-muted-foreground text-xs">
                <Trans>Showing recent vouchers only.</Trans>
              </p>
              <Button
                type="button"
                variant="outline"
                tap
                pending={group.source.retrying}
                onClick={group.source.retry}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}
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
              "flex w-full items-center gap-3 p-3 text-start",
              index === candidates.length - 1 ? "" : "border-b border-border",
            ].join(" ")}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-sm">{voucher.name}</span>
              <span className="block font-mono text-muted-foreground text-xs">
                {formatVoucherAddress(voucher.address)}
              </span>
            </span>
            <Badge variant="outline" size="sm" className="font-mono">
              {voucher.symbol}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
