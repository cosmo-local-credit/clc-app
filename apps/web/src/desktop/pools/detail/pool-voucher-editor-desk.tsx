import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  POOL_PRICE_INDEX_DECIMALS,
  POOL_VOUCHER_CUSTOM_FEED,
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
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from "#/components/ui/select";
import { copyValue, FullValue } from "#/desktop/ui/full-value";
import { PoolSidePanel } from "#/desktop/pools/detail/pool-side-panel";
import { DeskKV } from "#/desktop/ui/kv";
import type { OracleFeedRound } from "#/features/pools/hooks/use-pool-quoter";
import {
  previewCap,
  type PoolVoucherEditorVoucher,
  type PoolVoucherPricingSeed,
  usePoolVoucherConfiguration,
  usePoolVoucherEditor,
  usePoolVoucherFeedChoices,
  usePoolVoucherFigures,
  usePoolVoucherPicker,
  type VoucherBalanceState,
} from "#/features/pools/hooks/use-pool-voucher-editor";
import type { ApprovalCandidate } from "#/features/pools/logic/approval-suggestions";
import type { PoolApproveSeed } from "#/lib/navigation/pool-side";

/**
 * Approve a voucher into the pool (`voucher` null: pick one first) or change
 * one's rate and limit, in the side column. The reads, the gates and the one
 * relayed batch are `usePoolVoucherEditor` / `usePoolVoucherConfiguration`.
 */
export function PoolVoucherEditorSide({
  pool,
  poolVouchers,
  voucher,
  approveSeed = null,
  onClose,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  voucher: PoolVoucher | null;
  /** A steward-approve link's voucher, rate and limit. */
  approveSeed?: PoolApproveSeed | null;
  onClose: () => void;
}) {
  const editor = usePoolVoucherEditor({
    pool,
    voucher,
    approvedCatalog: poolVouchers,
    approveSeed,
  });
  const title = voucher ? <Trans>Manage voucher</Trans> : <Trans>Approve voucher</Trans>;
  const { selected, pricingSeed, seedRatePpm, configuring } = editor;
  const valued = editor.quoter.kind !== "oracle";

  if (configuring && pricingSeed) {
    return (
      <ConfigurationSide
        key={configuring.address}
        title={title}
        pool={pool}
        voucher={voucher}
        selected={configuring}
        pricingSeed={pricingSeed}
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
          valued={valued}
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
      ) : editor.candidate === "resolving" ? (
        status(<Trans>Finding that voucher…</Trans>)
      ) : editor.candidate === "unreadable" ? (
        <div className="grid gap-2 border border-border p-3">
          <p role="alert" className="text-xs text-destructive">
            <Trans>Couldn't load that voucher.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            pending={editor.retryingCandidate}
            onClick={editor.retryCandidate}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : (
        <>
          {editor.candidate === "missing" ? (
            <p role="alert" className="text-xs text-destructive">
              <Trans>Couldn't find that voucher</Trans>
            </p>
          ) : null}
          <VoucherPicker pool={pool} approvedCatalog={poolVouchers} onSelect={editor.setPicked} />
        </>
      )}
      {editor.quoter.isPending
        ? status(<Trans>Checking how this pool prices vouchers…</Trans>)
        : null}
      {editor.membershipPending ? status(<Trans>Checking approved vouchers…</Trans>) : null}
      {editor.ratePending ? status(<Trans>Reading the current rate…</Trans>) : null}
      {editor.oraclePending ? status(<Trans>Reading the current price feed…</Trans>) : null}
      {editor.feedsPending ? status(<Trans>Loading price feeds…</Trans>) : null}
      {editor.treasuryPending ? status(<Trans>Reading the pool's balance…</Trans>) : null}
      {editor.blockedReason ? (
        <div className="grid gap-2 border border-border p-3">
          <p role="alert" className="text-xs text-destructive">
            {editor.blockedReason}
          </p>
          {(editor.membershipUnread ||
            editor.rateUnread ||
            editor.oracleUnread ||
            editor.feedsUnread ||
            editor.capUnread) &&
          selected ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              pending={editor.membership.isFetching || editor.retryingReads || editor.retryingFeeds}
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
  pricingSeed,
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
  pricingSeed: PoolVoucherPricingSeed;
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
    inFlight,
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
    pricingSeed,
    seedCapRaw,
    hasLimiter,
    register,
    registrationUnknown,
    onClose,
  });
  const oracle = pricingSeed.kind === "oracle";

  return (
    <PoolSidePanel
      title={title}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={inFlight} onClick={onClose}>
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
            valued={!oracle}
            exchangeRate={exchangeRate}
            balance={balance}
            onRetry={onRetryReads}
            retrying={retryingReads}
            loadingDecimals={false}
            onChange={onChange}
          />
        )}
      </form.Subscribe>

      {pricingSeed.kind === "oracle" ? (
        <form.Field name="feed">
          {(feedField) => (
            <form.Field name="customAddress">
              {(customField) => (
                <FeedRow
                  seed={pricingSeed}
                  feed={feedField.state.value}
                  customAddress={customField.state.value}
                  onFeedChange={feedField.handleChange}
                  onCustomAddressChange={customField.handleChange}
                  onCustomAddressBlur={customField.handleBlur}
                  feedError={getFieldError(feedField.state.meta.errors)}
                  customAddressError={getFieldError(customField.state.meta.errors)}
                />
              )}
            </form.Field>
          )}
        </form.Field>
      ) : (
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
      )}

      {hasLimiter && oracle ? (
        <form.Field name="creditLimit">
          {(field) => (
            <LimitRow
              id="desk-pool-voucher-limit"
              heading={t`Credit limit`}
              unitSymbol={selected.symbol}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={getFieldError(field.state.meta.errors)}
            />
          )}
        </form.Field>
      ) : hasLimiter ? (
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
                  hint={t`The most ${selected.symbol} this pool will hold, valued in ${unitSymbol}. Room comes back as it's swapped out.`}
                  placeholder="0"
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Trans>
            This pool has no limiter, so it takes any amount of each voucher and no credit limit can
            be set.
          </Trans>
        </p>
      )}

      {voucher ? (
        <div className="grid gap-2 border-border border-t pt-4">
          {confirmingRemoval ? (
            <>
              <p className="text-xs text-muted-foreground">
                {oracle ? (
                  <Trans>
                    Removing {voucher.symbol} stops it being swapped in or out of this pool. Its
                    price feed and limit are kept.
                  </Trans>
                ) : (
                  <Trans>
                    Removing {voucher.symbol} stops it being swapped in or out of this pool. Its
                    rate and limit are kept.
                  </Trans>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={inFlight}
                  onClick={() => setConfirmingRemoval(false)}
                >
                  <Trans>Keep</Trans>
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={inFlight}
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
              disabled={inFlight}
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

/** The price feed: a verified feed from the registry, or a typed address. */
function FeedRow({
  seed,
  feed,
  customAddress,
  onFeedChange,
  onCustomAddressChange,
  onCustomAddressBlur,
  feedError,
  customAddressError,
}: {
  seed: Extract<PoolVoucherPricingSeed, { kind: "oracle" }>;
  feed: string;
  customAddress: string;
  onFeedChange: (next: string) => void;
  onCustomAddressChange: (next: string) => void;
  onCustomAddressBlur: () => void;
  feedError: string | null;
  customAddressError: string | null;
}) {
  const { choices, custom, unverified, selected, customRound } = usePoolVoucherFeedChoices(seed, {
    feed,
    customAddress,
  });

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor="desk-pool-voucher-feed" className="text-sm font-medium">
          <Trans>Price feed</Trans>
        </label>
        <SelectRoot
          value={feed}
          onValueChange={(value) => onFeedChange(typeof value === "string" ? value : "")}
        >
          <SelectTrigger
            id="desk-pool-voucher-feed"
            aria-invalid={!!feedError}
            className="w-full border-foreground/25"
          >
            <span className="min-w-0 flex-1 truncate text-start">
              {selected ? (
                <FeedOptionLabel label={selected.label} round={selected.round} />
              ) : custom ? (
                <Trans>Custom address</Trans>
              ) : (
                <span className="text-muted-foreground">
                  <Trans>Choose a price feed</Trans>
                </span>
              )}
            </span>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {choices.map((choice) => (
              <SelectItem key={choice.address} value={choice.address}>
                <FeedOptionLabel label={choice.label} round={choice.round} />
              </SelectItem>
            ))}
            <SelectItem value={POOL_VOUCHER_CUSTOM_FEED}>
              <Trans>Custom address</Trans>
            </SelectItem>
          </SelectContent>
        </SelectRoot>
        {feedError ? <FieldError error={feedError} /> : null}
        {choices.length === 0 ? (
          <p role="status" className="text-xs text-muted-foreground">
            <Trans>No verified price feeds</Trans>
          </p>
        ) : null}
      </div>
      {custom ? (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="desk-pool-voucher-feed-address" className="text-sm font-medium">
              <Trans>Feed address</Trans>
            </label>
            {unverified ? (
              <Badge variant="outline" size="sm" caps>
                <Trans>Unverified</Trans>
              </Badge>
            ) : null}
          </div>
          <Input
            id="desk-pool-voucher-feed-address"
            dir="ltr"
            value={customAddress}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onCustomAddressChange(event.target.value)}
            onBlur={onCustomAddressBlur}
            aria-invalid={!!customAddressError}
            className="font-mono"
          />
          {customAddressError ? (
            <FieldError error={customAddressError} />
          ) : customRound ? (
            <FeedRoundValue round={customRound} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FeedOptionLabel({ label, round }: { label: string; round: OracleFeedRound | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span dir="ltr" className="truncate font-mono text-sm">
        {label}
      </span>
      {round ? <FeedRoundValue round={round} /> : null}
    </span>
  );
}

function FeedRoundValue({ round }: { round: OracleFeedRound }) {
  if (round.status === "unreadable") {
    return (
      <Badge variant="muted" size="sm" caps>
        <Trans>Unreadable</Trans>
      </Badge>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span dir="ltr" className="font-mono text-xs text-muted-foreground">
        {round.price}
      </span>
      {round.stale ? (
        <Badge variant="muted" size="sm" caps>
          <Trans>Stale</Trans>
        </Badge>
      ) : null}
    </span>
  );
}

/** A limit typed in the voucher's own units. */
function LimitRow({
  id,
  heading,
  unitSymbol,
  value,
  onChange,
  onBlur,
  error,
}: {
  id: string;
  heading: string;
  unitSymbol: string;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  error: string | null;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {heading}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={id}
          dir="ltr"
          inputMode="decimal"
          value={value}
          placeholder="0"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          className="min-w-0 flex-1 font-mono"
        />
        <span dir="ltr" className="shrink-0 font-mono text-sm font-semibold">
          {unitSymbol}
        </span>
      </div>
      {error ? <FieldError error={error} /> : null}
    </div>
  );
}

function SelectedVoucher({
  voucher,
  unitSymbol,
  valued,
  exchangeRate,
  balance,
  onRetry,
  retrying,
  loadingDecimals,
  onChange,
}: {
  voucher: PoolVoucherEditorVoucher;
  unitSymbol: string;
  /** False on an oracle pool: there is no hand-set rate to value the holding at. */
  valued: boolean;
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
          ...(valued
            ? [
                [
                  <Trans key="label">Value in {unitSymbol}</Trans>,
                  balance.status === "loading"
                    ? reading
                    : unitValue === null
                      ? unavailable
                      : `${unitValue} ${unitSymbol}`,
                ] as const,
              ]
            : []),
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
