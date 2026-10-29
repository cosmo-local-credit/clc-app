import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  POOL_PRICE_INDEX_DECIMALS,
  type PoolVoucherRateInput,
} from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiDeleteBinLine, RiSearchLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { SectionHeading } from "#/components/ui/section-heading";
import { copyValue, FullValue } from "#/desktop/ui/full-value";
import { PoolSidePanel } from "#/desktop/pools/detail/pool-side-panel";
import { DeskKV } from "#/desktop/ui/kv";
import {
  previewCap,
  type PoolVoucherEditorVoucher,
  usePoolVoucherConfiguration,
  usePoolVoucherEditor,
  usePoolVoucherFigures,
  usePoolVoucherPicker,
  type VoucherBalanceState,
} from "#/features/pools/hooks/use-pool-voucher-editor";
import type { ApprovalCandidate } from "#/features/pools/logic/approval-suggestions";

/**
 * Approve a voucher into the pool (`voucher` null: pick one first) or change
 * one's rate and limit, in the side column. The reads, the gates and the one
 * relayed batch are `usePoolVoucherEditor` / `usePoolVoucherConfiguration`.
 */
export function PoolVoucherEditorSide({
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
  const title = voucher ? <Trans>Manage voucher</Trans> : <Trans>Approve voucher</Trans>;
  const { selected, seed, seedRatePpm, configuring } = editor;

  if (configuring && seed && seedRatePpm) {
    return (
      <ConfigurationSide
        key={configuring.address}
        title={title}
        pool={pool}
        voucher={voucher}
        selected={configuring}
        seed={seed}
        seedRatePpm={seedRatePpm}
        seedCapRaw={editor.seedCapRaw}
        hasLimiter={editor.hasLimiter}
        unitSymbol={editor.unitSymbol}
        balance={editor.balance}
        register={editor.register}
        registrationUnknown={editor.registrationUnknown}
        onRetryReads={editor.retryReads}
        retryingReads={editor.retryingReads}
        onChange={voucher ? undefined : () => editor.setPicked(null)}
        onClose={onClose}
      />
    );
  }

  const status = (copy: ReactNode) => <p className="text-xs text-muted-foreground">{copy}</p>;
  return (
    <PoolSidePanel
      title={title}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button type="button" disabled>
            {voucher ? <Trans>Save changes</Trans> : <Trans>Approve voucher</Trans>}
          </Button>
        </div>
      }
    >
      {selected ? (
        <SelectedVoucher
          voucher={selected}
          unitSymbol={editor.unitSymbol}
          exchangeRate={
            seedRatePpm
              ? formatTokenAmount(seedRatePpm, POOL_PRICE_INDEX_DECIMALS, POOL_PRICE_INDEX_DECIMALS)
              : null
          }
          balance={editor.balance}
          onRetry={editor.retryReads}
          retrying={editor.retryingReads}
          loadingDecimals={editor.decimalsPending}
          onChange={voucher ? undefined : () => editor.setPicked(null)}
        />
      ) : (
        <VoucherPicker pool={pool} approvedCatalog={poolVouchers} onSelect={editor.setPicked} />
      )}
      {editor.quoter.isPending
        ? status(<Trans>Checking how this pool prices vouchers…</Trans>)
        : null}
      {editor.membershipPending ? status(<Trans>Checking approved vouchers…</Trans>) : null}
      {editor.ratePending ? status(<Trans>Reading the current rate…</Trans>) : null}
      {editor.treasuryPending ? status(<Trans>Reading the pool's balance…</Trans>) : null}
      {editor.blockedReason ? (
        <div className="grid gap-2 border border-border p-3">
          <p role="alert" className="text-xs text-destructive">
            {editor.blockedReason}
          </p>
          {(editor.membershipUnread || editor.rateUnread || editor.capUnread) && selected ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              pending={editor.membership.isFetching || editor.retryingReads}
              onClick={editor.retryBlockedReads}
            >
              <Trans>Retry</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
    </PoolSidePanel>
  );
}

function ConfigurationSide({
  title,
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
  title: ReactNode;
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
    <PoolSidePanel
      title={title}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={relay.isPending} onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button type="submit" disabled={!canSubmit} pending={saving}>
            {saving ? (
              <Trans>Waiting for the chain…</Trans>
            ) : voucher ? (
              <Trans>Save changes</Trans>
            ) : (
              <Trans>Approve voucher</Trans>
            )}
          </Button>
        </div>
      }
    >
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
            id="desk-pool-voucher-rate"
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
                  id="desk-pool-voucher-limit"
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
        <p className="text-sm text-muted-foreground">
          <Trans>
            This pool has no limiter, so deposits are uncapped and no credit limit can be set.
          </Trans>
        </p>
      )}

      {voucher ? (
        <div className="grid gap-2 border-border border-t pt-4">
          {confirmingRemoval ? (
            <>
              <p className="text-xs text-muted-foreground">
                <Trans>
                  Removing {voucher.symbol} stops it being swapped in or out of this pool. Its rate
                  and limit are kept.
                </Trans>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={relay.isPending}
                  onClick={() => setConfirmingRemoval(false)}
                >
                  <Trans>Keep</Trans>
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={relay.isPending}
                  pending={removing}
                  onClick={() => void remove()}
                >
                  <Trans>Remove</Trans>
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              className="justify-self-start"
              disabled={relay.isPending}
              onClick={() => setConfirmingRemoval(true)}
            >
              <RiDeleteBinLine aria-hidden="true" />
              <Trans>Remove from pool</Trans>
            </Button>
          )}
        </div>
      ) : null}
    </PoolSidePanel>
  );
}

/** `{leading} = [input] {unit}` — the equation the steward is setting. */
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
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {heading}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <span dir="ltr" className="max-w-32 shrink-0 truncate font-mono text-sm font-semibold">
          {leading}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">=</span>
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
        <span dir="ltr" className="shrink-0 font-mono text-sm font-semibold">
          {unitSymbol}
        </span>
      </div>
      {error ? (
        <FieldError error={error} />
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
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
  const { t } = useLingui();
  const { amount, unitValue } = usePoolVoucherFigures(voucher, balance, exchangeRate);
  const reading = <Trans>Reading…</Trans>;
  const unavailable = <Trans>Unavailable</Trans>;
  return (
    <div className="grid gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p dir="auto" className="text-sm font-semibold [overflow-wrap:anywhere]">
            {voucher.name}
          </p>
          <p dir="ltr" className="font-mono text-xs text-muted-foreground">
            {voucher.symbol}
            {loadingDecimals
              ? " · …"
              : voucher.decimals === null
                ? ""
                : ` · ${voucher.decimals} dp`}
          </p>
          <FullValue
            value={voucher.address}
            copyLabel={t`Copy contract address`}
            onCopy={(value) =>
              copyValue(value, t`Contract address copied`, t`Couldn't copy contract address`)
            }
          />
        </div>
        {onChange ? (
          <Button type="button" variant="outline" onClick={onChange}>
            <Trans>Change</Trans>
          </Button>
        ) : null}
      </div>
      <DeskKV
        labelWidth="130px"
        rows={[
          [
            <Trans key="label">Amount in pool</Trans>,
            balance.status === "loading"
              ? reading
              : amount === null
                ? unavailable
                : `${amount} ${voucher.symbol}`,
          ],
          [
            <Trans key="label">Value in {unitSymbol}</Trans>,
            balance.status === "loading"
              ? reading
              : unitValue === null
                ? unavailable
                : `${unitValue} ${unitSymbol}`,
          ],
        ]}
      />
      {balance.status === "unavailable" ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          pending={retrying}
          onClick={onRetry}
        >
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </div>
  );
}

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
  const picker = usePoolVoucherPicker({ pool, approvedCatalog });
  const { search, registry, suggested, suggestions } = picker;
  const groups = [
    {
      id: "holdings",
      label: <Trans>Vouchers you hold</Trans>,
      rows: suggested.holdings,
      source: suggestions.holdings,
    },
    {
      id: "deposited",
      label: <Trans>Deposited in this pool</Trans>,
      rows: suggested.deposited,
      source: suggestions.deposited,
    },
    {
      id: "issued",
      label: <Trans>Vouchers you issued</Trans>,
      rows: suggested.issued,
      source: suggestions.issued,
    },
  ].filter(
    (group) =>
      group.rows.length > 0 ||
      group.source?.status === "loading" ||
      group.source?.status === "error" ||
      group.source?.completeness === "partial",
  );
  const muted = (copy: ReactNode, role?: "status" | "alert") => (
    <p role={role} className="text-xs text-muted-foreground">
      {copy}
    </p>
  );

  return (
    <div className="grid gap-3">
      <div className="relative">
        <RiSearchLine
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label={t`Search vouchers`}
          placeholder={t`Name, symbol or address`}
          value={picker.query}
          onChange={(event) => picker.setQuery(event.target.value)}
          className="ps-9"
        />
      </div>
      {picker.term.length > 0 && !picker.searching
        ? muted(<Trans>Type at least two characters.</Trans>)
        : null}
      {!picker.registryReady && !picker.registryError
        ? muted(<Trans>Checking approved vouchers…</Trans>)
        : null}
      {picker.registryError ? (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-sm text-destructive">
            <Trans>Couldn't check which vouchers are already approved.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            pending={registry.isFetching}
            onClick={() => void registry.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : picker.registryReady && picker.searching ? (
        <div className="grid gap-2">
          {search.status === "searching" ? muted(<Trans>Searching…</Trans>) : null}
          {search.status === "error" ? (
            <div className="flex items-center justify-between gap-3">
              <p role="alert" className="text-sm text-destructive">
                <Trans>Couldn't search vouchers.</Trans>
              </p>
              <Button
                type="button"
                variant="outline"
                pending={search.retrying}
                onClick={search.retry}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}
          {search.status === "ready" && picker.results.length === 0
            ? muted(<Trans>No vouchers match that search.</Trans>)
            : null}
          {picker.results.length > 0 ? (
            <CandidateList candidates={picker.results} onSelect={onSelect} />
          ) : null}
        </div>
      ) : picker.registryReady ? (
        groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`desk-approve-${group.id}`}
            className="grid gap-1.5"
          >
            <SectionHeading as="h3" variant="group" id={`desk-approve-${group.id}`}>
              {group.label}
            </SectionHeading>
            {group.rows.length > 0 ? (
              <CandidateList candidates={group.rows} onSelect={onSelect} />
            ) : group.source?.status === "loading" ? (
              muted(<Trans>Loading…</Trans>)
            ) : null}
            {group.source?.status === "error" ||
            (group.source?.status === "ready" && group.source.completeness === "partial") ? (
              <div className="flex items-center justify-between gap-3">
                {group.source.status === "error"
                  ? muted(<Trans>Unavailable</Trans>, "status")
                  : muted(<Trans>Showing recent vouchers only.</Trans>, "status")}
                <Button
                  type="button"
                  variant="outline"
                  pending={group.source.retrying}
                  onClick={group.source.retry}
                >
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : null}
          </section>
        ))
      ) : null}
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
    <ul className="border border-border">
      {candidates.map((voucher) => (
        <li key={voucher.address} className="border-border not-last:border-b">
          <button
            type="button"
            onClick={() => onSelect(voucher)}
            className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/60"
          >
            <span className="min-w-0 flex-1">
              <span dir="auto" className="block truncate text-sm font-semibold">
                {voucher.name}
              </span>
              <span dir="ltr" className="block font-mono text-xs text-muted-foreground">
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
