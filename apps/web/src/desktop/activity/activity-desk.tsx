import type { AccountActivityItem, ActivityKind } from "@clc/api/features/accounts/client";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiChat1Line, RiCloseLine, RiSearchLine } from "react-icons/ri";
import { toast } from "sonner";

import { formatActivityLegAmount, SwapActivityTitle } from "#/components/activity/swap-activity";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Input } from "#/components/ui/input";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Spinner } from "#/components/ui/spinner";
import { ShareReceiptButton, SignedAmount } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useSendShare } from "#/features/wallet/hooks/use-send-share";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";
import { ACTIVITY_KIND_ORDER } from "#/lib/navigation/activity-search";
import { useDebouncedValue } from "#/lib/use-debounced-value";

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
  const activity = activityQuery.data?.pages.flatMap((page) => page.activity) ?? [];
  const selected = tx
    ? (activity.find((item) => activityRowKey(item) === tx || item.txHash === tx) ?? null)
    : null;
  const armed = useRef<string | null>(null);
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const isFiltered = settled !== "" || types.length > 0;
  const labels: Record<ActivityKind, string> = {
    creation: t`Creation`,
    sent: t`Sent`,
    received: t`Received`,
    swapped: t`Swapped`,
  };

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

  function toggleType(kind: ActivityKind, checked: boolean) {
    onTypesChange?.(
      checked
        ? ACTIVITY_KIND_ORDER.filter((entry) => entry === kind || types.includes(entry))
        : types.filter((entry) => entry !== kind),
    );
  }

  const columns = useMemo<DeskColumn<AccountActivityItem>[]>(
    () => [
      {
        id: "activity",
        header: t`Activity`,
        width: "minmax(0,1.4fr)",
        sortValue: (row) => row.kind,
        cell: (row) => <ActivityLabel item={row} />,
      },
      {
        id: "with",
        header: t`With`,
        width: "minmax(0,1.2fr)",
        sortValue: (row) =>
          row.kind === "swapped" ? (row.poolAddresses[0] ?? "") : row.counterpartyAddress,
        cell: (row) =>
          row.kind === "swapped" ? (
            <span className="font-mono text-xs" dir="ltr">
              {row.poolAddresses[0]
                ? formatVoucherAddress(row.poolAddresses[0] as `0x${string}`)
                : "—"}
            </span>
          ) : row.kind === "creation" ? (
            <Trans>New supply</Trans>
          ) : (
            <span className="font-mono text-xs" dir="ltr">
              {formatVoucherAddress(row.counterpartyAddress as `0x${string}`)}
            </span>
          ),
      },
      {
        id: "amount",
        header: t`Amount`,
        align: "end",
        width: "11rem",
        sortValue: (row) =>
          Number(row.kind === "swapped" ? row.received.amount : row.transfer.amount),
        cell: (row) => (
          <span className="font-mono text-xs font-semibold" dir="ltr">
            {row.kind === "swapped"
              ? formatActivityLegAmount(row.received, locale)
              : `${formatTokenAmount(row.transfer.amount, row.transfer.tokenDecimals)} ${row.transfer.tokenSymbol}`}
          </span>
        ),
      },
      {
        id: "date",
        header: t`Date`,
        align: "end",
        width: "9rem",
        sortValue: (row) => Date.parse(row.dateBlock) || 0,
        cell: (row) => (
          <time className="font-mono text-xs" dateTime={row.dateBlock}>
            {formatTransferDate(row.dateBlock, locale)}
          </time>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas width="full">
            <DeskTitle>
              <Trans>Activity</Trans>
            </DeskTitle>
            <div className="mt-4 flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <RiSearchLine
                  className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  maxLength={66}
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  aria-label={t`Search activity`}
                  placeholder={t`Search activity`}
                  className="ps-9"
                />
              </div>
              {draftQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t`Clear search`}
                  onClick={() => setDraftQuery("")}
                >
                  <RiCloseLine aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <legend className="sr-only">{t`Activity`}</legend>
              {ACTIVITY_KIND_ORDER.map((kind) => (
                <label key={kind} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={types.includes(kind)}
                    onCheckedChange={(checked) => toggleType(kind, checked === true)}
                  />
                  <span>{labels[kind]}</span>
                </label>
              ))}
            </fieldset>
            {tooShort ? (
              <p className="mt-3 text-sm text-muted-foreground">
                <Trans>Type at least two characters.</Trans>
              </p>
            ) : null}
            <div className="mt-4" aria-busy={isDebouncing || activityQuery.isFetching}>
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
                <div className="space-y-2">
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
                            onQueryChange?.("");
                            onTypesChange?.([]);
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
              )}
              {activityQuery.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
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

function ActivityLabel({ item }: { item: AccountActivityItem }) {
  if (item.kind === "swapped") {
    return <SwapActivityTitle symbols={[item.received.tokenSymbol, item.sent.tokenSymbol]} />;
  }
  const created = item.kind === "creation";
  return (
    <span className="inline-flex items-center gap-1.5">
      {created ? (
        <Trans>Created</Trans>
      ) : item.kind === "received" ? (
        <Trans>Received</Trans>
      ) : (
        <Trans>Sent</Trans>
      )}
      {item.hasNote ? (
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
  const title =
    item?.kind === "swapped" ? (
      <Trans>Swap</Trans>
    ) : item?.kind === "creation" ? (
      <Trans>Created</Trans>
    ) : item?.kind === "received" ? (
      <Trans>Received</Trans>
    ) : (
      <Trans>Sent</Trans>
    );
  return (
    <DeskInspector title={item ? title : t`Activity`} onClose={onClose}>
      {item?.kind === "swapped" ? (
        <SwapInspector item={item} />
      ) : item ? (
        <TransferInspector item={item} />
      ) : missing ? (
        <p role="alert" className="text-sm text-muted-foreground">
          <Trans>Couldn't load activity.</Trans>
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

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-border border-b px-3 py-2 last:border-b-0">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <div className="min-w-0 text-end">{children}</div>
    </div>
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
  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy transaction hash`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Transaction hash copied`))
      .catch(() => toast.error(t`Couldn't copy transaction hash`));
  };

  return (
    <div className="space-y-4">
      <div className="border border-border bg-card">
        <DetailRow label={t`Status`}>
          <Badge variant={item.success ? "primary" : "muted"} size="sm" caps>
            {item.success ? t`Confirmed` : t`Failed`}
          </Badge>
        </DetailRow>
        <DetailRow label={t`Amount`}>
          <span className="font-mono text-xs font-semibold" dir="ltr">
            <span className="block">{tokenAmount}</span>
            {uoaLabel ? <span className="block text-muted-foreground">({uoaLabel})</span> : null}
          </span>
        </DetailRow>
        <DetailRow label={t`Date`}>
          <time className="font-mono text-xs font-semibold" dateTime={item.dateBlock}>
            {transferDate}
          </time>
        </DetailRow>
        <DetailRow label={t`From`}>
          {created ? (
            <span className="text-xs font-semibold">
              <Trans>New supply</Trans>
            </span>
          ) : (
            <RecipientIdentityLabel address={item.senderAddress} showAddress />
          )}
        </DetailRow>
        <DetailRow label={t`To`}>
          <RecipientIdentityLabel address={item.recipientAddress} showAddress />
        </DetailRow>
        <DetailRow label={t`Transaction`}>
          <CopyableInfoValue value={item.txHash} label={t`Copy transaction hash`} onCopy={copy} />
        </DetailRow>
      </div>
      <PrivateAttachment query={shareQuery} />
      {item.success ? (
        <ShareReceiptButton
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
      <Button asChild>
        <a href={explorerUrl} target="_blank" rel="noreferrer">
          <Trans>View on block explorer</Trans>
        </a>
      </Button>
    </div>
  );
}

function SwapInspector({ item }: { item: Extract<AccountActivityItem, { kind: "swapped" }> }) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy transaction hash`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Transaction hash copied`))
      .catch(() => toast.error(t`Couldn't copy transaction hash`));
  };
  return (
    <div className="space-y-4">
      <div className="border border-border bg-card">
        <DetailRow label={t`Status`}>
          <Badge variant={item.success ? "primary" : "muted"} size="sm" caps>
            {item.success ? t`Confirmed` : t`Failed`}
          </Badge>
        </DetailRow>
        <DetailRow label={t`Sent`}>
          <SignedAmount direction="out" amount={formatActivityLegAmount(item.sent, locale)} />
        </DetailRow>
        <DetailRow label={t`Received`}>
          <SignedAmount direction="in" amount={formatActivityLegAmount(item.received, locale)} />
        </DetailRow>
        {item.protocolFee ? (
          <DetailRow label={t`Protocol fee`}>
            <span className="font-mono text-xs font-semibold" dir="ltr">
              {formatActivityLegAmount(item.protocolFee, locale)}
            </span>
          </DetailRow>
        ) : null}
        <DetailRow label={item.poolAddresses.length > 1 ? t`Pools` : t`Pool`}>
          <span className="space-y-1 text-end">
            {item.poolAddresses.map((address) => (
              <span key={address} className="block font-mono text-xs" dir="ltr">
                {formatVoucherAddress(address as `0x${string}`)}
              </span>
            ))}
          </span>
        </DetailRow>
        <DetailRow label={t`Date`}>
          <time className="font-mono text-xs font-semibold" dateTime={item.dateBlock}>
            {formatTransferDate(item.dateBlock, locale)}
          </time>
        </DetailRow>
        <DetailRow label={t`Transaction`}>
          <CopyableInfoValue value={item.txHash} label={t`Copy transaction hash`} onCopy={copy} />
        </DetailRow>
      </div>
      <Button asChild>
        <a href={explorerTxUrl(CHAIN_INFO, item.txHash)} target="_blank" rel="noreferrer">
          <Trans>View on block explorer</Trans>
        </a>
      </Button>
    </div>
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
