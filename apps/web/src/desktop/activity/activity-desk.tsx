import type { AccountActivityItem, ActivityKind } from "@clc/api/features/accounts/client";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  RiChat1Line,
  RiCloseLine,
  RiDownload2Line,
  RiExternalLinkLine,
  RiSearchLine,
} from "react-icons/ri";
import { toast } from "sonner";

import { formatActivityLegAmount } from "#/components/activity/swap-activity";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Input } from "#/components/ui/input";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { ShareReceiptButton } from "#/components/wallet";
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskEyebrow, DeskTitleRow } from "#/desktop/ui/page";
import { DeskChip } from "#/desktop/ui/segment";
import { useSendShare } from "#/features/wallet/hooks/use-send-share";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import {
  activityCsv,
  activityRangeStart,
  activityVouchers,
  filterActivityRows,
} from "#/features/wallet/logic/activity-export";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";
import {
  ACTIVITY_KIND_ORDER,
  ACTIVITY_RANGES,
  type ActivityRange,
  parseActivityDeskFilters,
} from "#/lib/navigation/activity-search";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { cn } from "#/lib/utils";

/** Search for an open activity inspector. The first open pushes; Back drops `tx`. */
export function activityInspectorSearch<Search extends { tx?: string }>(
  previous: Search,
  tx: string,
): Search & { tx: string } {
  return { ...previous, tx };
}

export function activityRowKey(item: { id: number; txHash: string }) {
  return `${item.id}:${item.txHash}`;
}

function readTx(search: unknown): string | undefined {
  if (typeof search !== "object" || search === null) return undefined;
  const tx = (search as { tx?: unknown }).tx;
  return typeof tx === "string" && tx.length > 0 ? tx : undefined;
}

const CONFIRMED_BADGE = "border-success-ink/35 bg-success/10 text-success-ink";

/** The leg a row's amount shows: what arrived for a swap, the transfer otherwise. */
function rowAmount(item: AccountActivityItem) {
  const leg = item.kind === "swapped" ? item.received : item.transfer;
  return {
    incoming: item.kind !== "sent",
    value: formatTokenAmount(leg.amount, leg.tokenDecimals),
    symbol: leg.tokenSymbol,
  };
}

function counterparty(item: AccountActivityItem): string | null {
  if (item.kind === "swapped") return item.poolAddresses[0] ?? null;
  if (item.kind === "creation") return null;
  return item.counterpartyAddress;
}

export function ActivityDesk({
  address,
  query = "",
  types = [],
  onQueryChange,
  onTypesChange,
}: {
  address?: string;
  query?: string;
  types?: readonly ActivityKind[];
  onQueryChange?: (query: string) => void;
  onTypesChange?: (types: readonly ActivityKind[]) => void;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate({ from: "/" });
  const router = useRouter();
  const locationSearch = useRouterState({ select: (state) => state.location.search });
  const tx = readTx(locationSearch);
  const filters = parseActivityDeskFilters(locationSearch);
  const [draftQuery, setDraftQuery] = useState(query);
  const term = draftQuery.trim().replace(/\s+/gu, " ");
  const { settled, isPending: isDebouncing } = useDebouncedValue(term);
  const tooShort = term !== "" && Array.from(term).length < 2;
  const searchReady = !isDebouncing && !tooShort;
  const activityQuery = useAccountActivityInfinite(address, {
    poll: settled === "" && types.length === 0,
    q: settled,
    types,
    enabled: searchReady,
  });
  const loaded = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.activity) ?? [],
    [activityQuery.data],
  );
  const vouchers = useMemo(() => activityVouchers(loaded), [loaded]);
  // The window is measured from when the range was picked, not every render.
  const rangeStart = useMemo(() => activityRangeStart(filters.range, Date.now()), [filters.range]);
  const activity = useMemo(
    () => filterActivityRows(loaded, { voucher: filters.voucher, start: rangeStart }),
    [filters.voucher, loaded, rangeStart],
  );
  const oldest = loaded.at(-1);
  // Rows arrive newest first: once a loaded row predates the window, nothing older can match.
  const pastWindow =
    rangeStart !== null && oldest !== undefined && (Date.parse(oldest.dateBlock) || 0) < rangeStart;
  const selected = tx
    ? (loaded.find((item) => activityRowKey(item) === tx || item.txHash === tx) ?? null)
    : null;
  const armed = useRef<string | null>(null);
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const isFiltered =
    settled !== "" || types.length > 0 || filters.voucher !== undefined || rangeStart !== null;
  const rangeLabels: Record<ActivityRange, string> = {
    "7d": t`Last 7 days`,
    "30d": t`Last 30 days`,
    "90d": t`Last 90 days`,
  };
  const voucherOptions =
    filters.voucher && !vouchers.some((entry) => entry.address === filters.voucher)
      ? [...vouchers, { address: filters.voucher, symbol: formatVoucherAddress(filters.voucher) }]
      : vouchers;
  const voucherLabel = voucherOptions.find((entry) => entry.address === filters.voucher)?.symbol;
  const labels: Record<ActivityKind, string> = {
    creation: t`Created`,
    sent: t`Sent`,
    received: t`Received`,
    swapped: t`Swaps`,
  };
  const withHeader =
    types.length === 1 && types[0] === "received"
      ? t`From`
      : types.length === 1 && types[0] === "sent"
        ? t`To`
        : t`With`;

  useEffect(() => setDraftQuery(query), [query]);
  useEffect(() => {
    if (!isDebouncing && settled !== query) onQueryChange?.(settled);
  }, [isDebouncing, onQueryChange, query, settled]);
  useEffect(() => {
    if (tx) armed.current = null;
  }, [tx]);

  function openInspector(item: AccountActivityItem) {
    const key = activityRowKey(item);
    if (key === tx || key === armed.current) return;
    const replace = tx != null || armed.current != null;
    armed.current = key;
    void navigate({
      search: (previous) => activityInspectorSearch(previous, key),
      replace,
    });
  }

  function setDeskFilter(next: { activityVoucher?: string; activityRange?: ActivityRange }) {
    void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true });
  }

  function exportCsv() {
    const blob = new Blob([activityCsv(activity)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleType(kind: ActivityKind) {
    const on = types.includes(kind);
    onTypesChange?.(
      on
        ? types.filter((entry) => entry !== kind)
        : ACTIVITY_KIND_ORDER.filter((entry) => entry === kind || types.includes(entry)),
    );
  }

  const columns = useMemo<DeskColumn<AccountActivityItem>[]>(
    () => [
      {
        id: "date",
        header: t`Date`,
        width: "9.5rem",
        sortValue: (row) => Date.parse(row.dateBlock) || 0,
        cell: (row) => (
          <time className="font-mono text-xs" dateTime={row.dateBlock}>
            {formatTransferDate(row.dateBlock, locale)}
          </time>
        ),
      },
      {
        id: "with",
        header: withHeader,
        width: "minmax(0,1.6fr)",
        sortValue: (row) => counterparty(row) ?? "",
        cell: (row) => {
          const other = counterparty(row);
          return other ? (
            <Counterparty address={other} />
          ) : (
            <span className="text-sm font-semibold">
              <Trans>New supply</Trans>
            </span>
          );
        },
      },
      {
        id: "type",
        header: t`Type`,
        width: "7.5rem",
        sortValue: (row) => row.kind,
        cell: (row) => <ActivityType item={row} />,
      },
      {
        id: "amount",
        header: t`Amount`,
        align: "end",
        width: "minmax(0,1.2fr)",
        sortValue: (row) =>
          Number(row.kind === "swapped" ? row.received.amount : row.transfer.amount),
        cell: (row) => {
          const amount = rowAmount(row);
          return (
            <span
              className={cn(
                "font-mono text-sm font-semibold",
                amount.incoming && "text-success-ink",
              )}
              dir="ltr"
            >
              {amount.incoming ? "+" : "−"}
              {amount.value} {amount.symbol}
            </span>
          );
        },
      },
      {
        id: "status",
        header: t`Status`,
        width: "7.5rem",
        sortValue: (row) => (row.success ? 1 : 0),
        cell: (row) => (
          <Badge
            size="sm"
            caps
            variant={row.success ? "primary" : "muted"}
            className={cn(row.success && CONFIRMED_BADGE)}
          >
            {row.success ? t`Confirmed` : t`Failed`}
          </Badge>
        ),
      },
    ],
    [locale, t, withHeader],
  );

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas className="gap-4">
            <DeskTitleRow
              title={<Trans>Activity</Trans>}
              actions={
                <Button
                  type="button"
                  variant="outline"
                  disabled={activity.length === 0}
                  onClick={exportCsv}
                >
                  <RiDownload2Line aria-hidden="true" />
                  <Trans>Export CSV</Trans>
                </Button>
              }
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <DeskChip on={types.length === 0}>
                <button
                  type="button"
                  aria-pressed={types.length === 0}
                  onClick={() => {
                    if (types.length > 0) onTypesChange?.([]);
                  }}
                >
                  <Trans>All</Trans>
                </button>
              </DeskChip>
              {(["sent", "received", "swapped", "creation"] as const).map((kind) => (
                <DeskChip key={kind} on={types.includes(kind)}>
                  <button
                    type="button"
                    aria-pressed={types.includes(kind)}
                    onClick={() => toggleType(kind)}
                  >
                    {labels[kind]}
                  </button>
                </DeskChip>
              ))}
              <div className="ms-auto flex min-w-0 items-center gap-2">
                <SelectRoot
                  value={filters.voucher ?? ""}
                  onValueChange={(value) =>
                    setDeskFilter({
                      activityVoucher: typeof value === "string" && value ? value : undefined,
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={t`Voucher`}
                    className="max-w-48 border-foreground/25 text-xs font-medium"
                  >
                    <span className="min-w-0 truncate">
                      {voucherLabel ? (
                        <Trans>
                          Voucher: <span dir="ltr">{voucherLabel}</span>
                        </Trans>
                      ) : (
                        <Trans>Voucher: Any</Trans>
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="">
                      <Trans>Any voucher</Trans>
                    </SelectItem>
                    {voucherOptions.map((entry) => (
                      <SelectItem key={entry.address} value={entry.address}>
                        <span className="font-mono text-xs" dir="ltr">
                          {entry.symbol}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
                <SelectRoot
                  value={filters.range ?? ""}
                  onValueChange={(value) =>
                    setDeskFilter({
                      activityRange: ACTIVITY_RANGES.find((range) => range === value),
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={t`Date range`}
                    className="border-foreground/25 text-xs font-medium"
                  >
                    {filters.range ? rangeLabels[filters.range] : <Trans>All time</Trans>}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      <Trans>All time</Trans>
                    </SelectItem>
                    {ACTIVITY_RANGES.map((range) => (
                      <SelectItem key={range} value={range}>
                        {rangeLabels[range]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
                <div className="relative w-56 min-w-0">
                  <RiSearchLine
                    className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    maxLength={66}
                    value={draftQuery}
                    onChange={(event) => setDraftQuery(event.target.value)}
                    aria-label={t`Search activity`}
                    placeholder={t`Search activity`}
                    className={cn("ps-8 text-sm", draftQuery && "pe-9")}
                  />
                  {draftQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 end-0"
                      aria-label={t`Clear search`}
                      onClick={() => setDraftQuery("")}
                    >
                      <RiCloseLine aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            {tooShort ? (
              <p className="text-sm text-muted-foreground">
                <Trans>Type at least two characters.</Trans>
              </p>
            ) : null}
            <div
              className="grid min-w-0 justify-items-start gap-3"
              aria-busy={isDebouncing || activityQuery.isFetching}
            >
              {searchReady && activityQuery.isSuccess && activity.length > 0 ? (
                <span className="sr-only">
                  <Plural
                    value={activity.length}
                    one="# activity item shown."
                    other="# activity items shown."
                  />
                </span>
              ) : null}
              {!address ? (
                <p className="text-sm text-muted-foreground">
                  <Trans>No activity yet.</Trans>
                </p>
              ) : !searchReady ? (
                isDebouncing ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner />
                    <Trans>Loading activity…</Trans>
                  </p>
                ) : null
              ) : activityQuery.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  <Trans>Loading activity…</Trans>
                </p>
              ) : activityQuery.isError ? (
                <div className="grid justify-items-start gap-2">
                  <p role="alert" className="text-sm text-muted-foreground">
                    <Trans>Couldn't load activity.</Trans>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    pending={activityQuery.isFetching}
                    onClick={() => void activityQuery.refetch()}
                  >
                    <Trans>Try again</Trans>
                  </Button>
                </div>
              ) : (
                <div className="w-full min-w-0">
                  <DeskTable
                    label={t`Activity`}
                    rows={activity}
                    columns={columns}
                    rowKey={activityRowKey}
                    selectedKey={selected ? activityRowKey(selected) : null}
                    onSelect={openInspector}
                    empty={
                      isFiltered ? (
                        <span className="flex flex-col items-start gap-2">
                          <Trans>No activity matches these filters.</Trans>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setDraftQuery("");
                              void navigate({
                                search: (previous) => ({
                                  ...previous,
                                  activityQ: undefined,
                                  activityTypes: undefined,
                                  activityVoucher: undefined,
                                  activityRange: undefined,
                                }),
                              });
                            }}
                          >
                            <Trans>Clear filters</Trans>
                          </Button>
                        </span>
                      ) : (
                        <Trans>No activity yet.</Trans>
                      )
                    }
                  />
                </div>
              )}
              {activityQuery.hasNextPage && !pastWindow ? (
                <Button
                  type="button"
                  variant="outline"
                  pending={activityQuery.isFetchingNextPage}
                  onClick={() => void activityQuery.fetchNextPage()}
                >
                  <Trans>Load more</Trans>
                </Button>
              ) : null}
            </div>
          </DeskCanvas>
        }
        side={
          tx ? (
            <ActivityInspector
              item={selected}
              missing={!activityQuery.isPending && !selected}
              onClose={() => router.history.back()}
            />
          ) : null
        }
      />
    </div>
  );
}

/** A counterparty by name when one resolves, otherwise its short address. */
function Counterparty({ address }: { address: string }) {
  const identity = useReverseRecipientResolution(address);
  return identity.data ? (
    <RecipientIdentityText identity={identity.data} className="block truncate font-semibold" />
  ) : (
    <span className="font-mono text-xs" dir="ltr">
      {formatVoucherAddress(address as `0x${string}`)}
    </span>
  );
}

function ActivityType({ item }: { item: AccountActivityItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" size="sm">
        {item.kind === "swapped" ? (
          <Trans>Swap</Trans>
        ) : item.kind === "creation" ? (
          <Trans>Created</Trans>
        ) : item.kind === "received" ? (
          <Trans>Received</Trans>
        ) : (
          <Trans>Sent</Trans>
        )}
      </Badge>
      {item.kind !== "swapped" && item.hasNote ? (
        <>
          <RiChat1Line className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">
            <Trans>Has a message</Trans>
          </span>
        </>
      ) : null}
    </span>
  );
}

function ActivityInspector({
  item,
  missing,
  onClose,
}: {
  item: AccountActivityItem | null;
  missing: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <DeskInspector title={<Trans>Transfer details</Trans>} onClose={onClose}>
      {item?.kind === "swapped" ? (
        <SwapInspector item={item} />
      ) : item ? (
        <TransferInspector item={item} />
      ) : missing ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {t`Couldn't load activity.`}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Loading activity…</Trans>
        </p>
      )}
    </DeskInspector>
  );
}

/** RECEIVED over the signed figure, as the mock's inspector heads a transfer. */
function AmountHead({
  eyebrow,
  incoming,
  value,
  symbol,
  detail,
}: {
  eyebrow: ReactNode;
  incoming: boolean;
  value: string;
  symbol: string;
  detail?: string | null;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <DeskEyebrow>{eyebrow}</DeskEyebrow>
      <div className="flex min-w-0 items-baseline gap-1.5" dir="ltr">
        <span
          className={cn(
            "truncate font-mono text-2xl font-semibold",
            incoming && "text-success-ink",
          )}
        >
          {incoming ? "+" : "−"}
          {value}
        </span>
        <span className="shrink-0 font-mono text-sm text-muted-foreground">{symbol}</span>
      </div>
      {detail ? (
        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
          ({detail})
        </span>
      ) : null}
    </div>
  );
}

function useCopyTxHash() {
  const { t } = useLingui();
  return (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy transaction hash`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Transaction hash copied`))
      .catch(() => toast.error(t`Couldn't copy transaction hash`));
  };
}

function ExplorerButton({ txHash }: { txHash: string }) {
  return (
    <Button asChild variant="outline" className="w-full min-w-0">
      <a href={explorerTxUrl(CHAIN_INFO, txHash)} target="_blank" rel="noreferrer">
        <span className="truncate">{CHAIN_INFO.explorerName}</span>
        <RiExternalLinkLine aria-hidden="true" />
      </a>
    </Button>
  );
}

function AddressValue({ address }: { address: string }) {
  const identity = useReverseRecipientResolution(address);
  return (
    <span className="grid min-w-0" title={address}>
      {identity.data ? (
        <RecipientIdentityText
          identity={identity.data}
          className="truncate font-sans font-semibold"
        />
      ) : null}
      <span className="truncate" dir="ltr">
        {formatVoucherAddress(address as `0x${string}`)}
      </span>
    </span>
  );
}

function TransferInspector({ item }: { item: Exclude<AccountActivityItem, { kind: "swapped" }> }) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const created = item.kind === "creation";
  const transferDate = formatTransferDate(item.dateBlock, locale);
  const uoaLabel = formatTransferUnitValue(item.transfer.uoaValue, item.transfer.uoa, locale);
  const tokenAmount = `${formatTokenAmount(item.transfer.amount, item.transfer.tokenDecimals)} ${item.transfer.tokenSymbol}`;
  const amountLabel = uoaLabel ? `${tokenAmount} (${uoaLabel})` : tokenAmount;
  const explorerUrl = explorerTxUrl(CHAIN_INFO, item.txHash);
  const shareQuery = useSendShare(item.txHash, item.success && !created);
  const copy = useCopyTxHash();

  return (
    <>
      <AmountHead
        eyebrow={
          created ? (
            <Trans>Created</Trans>
          ) : item.kind === "received" ? (
            <Trans>Received</Trans>
          ) : (
            <Trans>Sent</Trans>
          )
        }
        incoming={item.kind !== "sent"}
        value={formatTokenAmount(item.transfer.amount, item.transfer.tokenDecimals)}
        symbol={item.transfer.tokenSymbol}
        detail={uoaLabel}
      />
      <DeskKV
        rows={[
          [
            t`Status`,
            <Badge
              key="status"
              size="sm"
              caps
              variant={item.success ? "primary" : "muted"}
              className={cn("font-sans", item.success && CONFIRMED_BADGE)}
            >
              {item.success ? t`Confirmed` : t`Failed`}
            </Badge>,
          ],
          [
            t`Date`,
            <time key="date" dateTime={item.dateBlock}>
              {transferDate}
            </time>,
          ],
          [
            t`From`,
            created ? (
              <span key="from" className="font-sans">
                <Trans>New supply</Trans>
              </span>
            ) : (
              <AddressValue key="from" address={item.senderAddress} />
            ),
          ],
          [t`To`, <AddressValue key="to" address={item.recipientAddress} />],
          [
            t`Transaction`,
            <CopyableInfoValue
              key="tx"
              value={item.txHash}
              label={t`Copy transaction hash`}
              onCopy={copy}
            />,
          ],
        ]}
      />
      <PrivateAttachment query={shareQuery} />
      <div className={cn("grid gap-4", item.success && "grid-cols-2")}>
        {item.success ? (
          <ShareReceiptButton
            className="w-full min-w-0"
            title={created ? t`Voucher creation receipt` : t`Payment receipt`}
            lines={[
              created
                ? t`I created ${amountLabel}.`
                : item.kind === "sent"
                  ? t`I sent ${amountLabel} to ${item.recipientAddress}.`
                  : t`I received ${amountLabel} from ${item.senderAddress}.`,
              ...(transferDate ? [transferDate] : []),
            ]}
            url={explorerUrl}
          />
        ) : null}
        <ExplorerButton txHash={item.txHash} />
      </div>
    </>
  );
}

function SwapInspector({ item }: { item: Extract<AccountActivityItem, { kind: "swapped" }> }) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const copy = useCopyTxHash();
  return (
    <>
      <AmountHead
        eyebrow={<Trans>Swap</Trans>}
        incoming
        value={formatTokenAmount(item.received.amount, item.received.tokenDecimals)}
        symbol={item.received.tokenSymbol}
      />
      <DeskKV
        rows={[
          [
            t`Status`,
            <Badge
              key="status"
              size="sm"
              caps
              variant={item.success ? "primary" : "muted"}
              className={cn("font-sans", item.success && CONFIRMED_BADGE)}
            >
              {item.success ? t`Confirmed` : t`Failed`}
            </Badge>,
          ],
          [
            t`Sent`,
            <span key="sent" dir="ltr">
              −{formatActivityLegAmount(item.sent, locale)}
            </span>,
          ],
          [
            t`Received`,
            <span key="received" className="text-success-ink" dir="ltr">
              +{formatActivityLegAmount(item.received, locale)}
            </span>,
          ],
          item.protocolFee
            ? [
                t`Protocol fee`,
                <span key="fee" dir="ltr">
                  {formatActivityLegAmount(item.protocolFee, locale)}
                </span>,
              ]
            : null,
          [
            item.poolAddresses.length > 1 ? t`Pools` : t`Pool`,
            <span key="pools" className="grid min-w-0">
              {item.poolAddresses.map((address) => (
                <span key={address} className="truncate" dir="ltr">
                  {formatVoucherAddress(address as `0x${string}`)}
                </span>
              ))}
            </span>,
          ],
          [
            t`Date`,
            <time key="date" dateTime={item.dateBlock}>
              {formatTransferDate(item.dateBlock, locale)}
            </time>,
          ],
          [
            t`Transaction`,
            <CopyableInfoValue
              key="tx"
              value={item.txHash}
              label={t`Copy transaction hash`}
              onCopy={copy}
            />,
          ],
        ]}
      />
      <ExplorerButton txHash={item.txHash} />
    </>
  );
}

function PrivateAttachment({ query }: { query: ReturnType<typeof useSendShare> }) {
  const share = query.data;
  if (query.isPending && query.fetchStatus !== "idle") {
    return (
      <p className="text-muted-foreground text-xs">
        <Trans>Loading private attachment…</Trans>
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="text-destructive text-xs">
        <Trans>Couldn't load the private attachment.</Trans>
      </p>
    );
  }
  if (!share) return null;
  return (
    <section className="space-y-3 border border-border bg-card p-3" aria-label="Private attachment">
      <div>
        <p className="font-semibold text-sm">
          <Trans>Private attachment</Trans>
        </p>
        <p className="text-muted-foreground text-xs">
          <Trans>Shared by {share.sharedBy.name}</Trans>
        </p>
      </div>
      {share.note ? (
        <p
          dir="auto"
          className="whitespace-pre-wrap break-words border-primary border-s-2 ps-3 text-sm"
        >
          {share.note}
        </p>
      ) : null}
      {share.sharedBy.email ? (
        <p className="text-xs">
          <span className="text-muted-foreground">
            <Trans>Email</Trans>
          </span>{" "}
          <a className="font-semibold text-primary" href={`mailto:${share.sharedBy.email}`}>
            {share.sharedBy.email}
          </a>
        </p>
      ) : null}
      {share.sharedBy.phone ? (
        <p className="font-mono text-xs">
          <span className="font-sans text-muted-foreground">
            <Trans>Phone</Trans>
          </span>{" "}
          <a className="font-semibold text-primary" href={`tel:${share.sharedBy.phone}`}>
            {share.sharedBy.phone}
          </a>
        </p>
      ) : null}
      {share.sharedBy.location ? (
        <div className="space-y-2">
          <p className="text-end text-xs font-semibold">{share.sharedBy.location.locationName}</p>
          <Suspense fallback={<div className="h-36 w-full bg-muted" />}>
            <LocationMap
              lat={share.sharedBy.location.lat}
              lng={share.sharedBy.location.lng}
              className="h-36"
            />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}
