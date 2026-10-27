import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiArrowLeftDownLine, RiArrowRightUpLine, RiSparkling2Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { activityRowKey } from "#/desktop/activity/activity-desk";
import { type DeskColumn, DeskTable } from "#/desktop/ui/data-table";
import { DeskPanel, DeskSection } from "#/desktop/ui/page";
import { useVoucherTransfers } from "#/features/wallet/hooks/use-voucher-transfers";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { cn } from "#/lib/utils";

type Transfer = ReturnType<typeof useVoucherTransfers>["transfers"][number];

/**
 * The viewer's own transfers of this voucher as a table. A row opens the
 * transfer in Activity's inspector, the desktop's one transfer-details view.
 */
export function VoucherActivityDesk({
  accountAddress,
  contractAddress,
  layout,
}: {
  accountAddress: string | undefined;
  contractAddress: string;
  layout: "page" | "panel";
}) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const { transfersQuery, visibleTransfers, hasMoreTransfers, loadMore } = useVoucherTransfers(
    accountAddress,
    contractAddress,
  );

  const columns: DeskColumn<Transfer>[] = [
    {
      id: "type",
      header: <Trans>Type</Trans>,
      width: layout === "page" ? "minmax(0,1.6fr)" : "minmax(0,1.4fr)",
      cell: (transfer) => {
        const created = isVoucherCreationTransfer(transfer);
        const incoming = transfer.direction === "IN";
        return (
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center bg-muted",
                created ? "text-foreground" : incoming ? "text-primary" : "text-destructive",
              )}
            >
              {created ? (
                <RiSparkling2Line className="size-3.5" aria-hidden="true" />
              ) : incoming ? (
                <RiArrowLeftDownLine className="size-3.5" aria-hidden="true" />
              ) : (
                <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {created ? (
                  <Trans>Created</Trans>
                ) : incoming ? (
                  <Trans>Received</Trans>
                ) : (
                  <Trans>Sent</Trans>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {created ? (
                  <Trans>New supply</Trans>
                ) : (
                  <>
                    {incoming ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                    <RecipientIdentityLabel address={transfer.counterpartyAddress} />
                  </>
                )}
              </span>
            </span>
          </span>
        );
      },
    },
    ...(layout === "page"
      ? [
          {
            id: "date",
            header: <Trans>Date</Trans>,
            width: "minmax(0,1fr)",
            sortValue: (transfer: Transfer) => Date.parse(transfer.dateBlock) || 0,
            cell: (transfer: Transfer) => (
              <time dateTime={transfer.dateBlock} className="font-mono text-xs">
                {formatTransferDate(transfer.dateBlock, locale)}
              </time>
            ),
          } satisfies DeskColumn<Transfer>,
        ]
      : []),
    {
      id: "amount",
      header: <Trans>Amount</Trans>,
      align: "end",
      width: "minmax(0,1fr)",
      cell: (transfer) => {
        const unit = formatTransferUnitValue(transfer.uoaValue, transfer.uoa, locale);
        return (
          <span dir="ltr" className="block truncate font-mono font-semibold">
            {formatTokenAmount(transfer.amount, transfer.tokenDecimals)} {transfer.tokenSymbol}
            {unit ? (
              <span className="block truncate text-xs font-normal text-muted-foreground">
                ({unit})
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];

  let body;
  if (!accountAddress) {
    body = (
      <DeskPanel>
        <p className="text-sm text-muted-foreground">
          <Trans>Sign in to view activity.</Trans>
        </p>
      </DeskPanel>
    );
  } else if (transfersQuery.isPending) {
    body = (
      <DeskPanel>
        <p className="text-sm text-muted-foreground">
          <Trans>Loading activity…</Trans>
        </p>
      </DeskPanel>
    );
  } else if (transfersQuery.isError) {
    body = (
      <DeskPanel className="grid justify-items-start gap-3">
        <p className="text-sm text-muted-foreground">
          <Trans>Couldn't load activity.</Trans>
        </p>
        <Button
          variant="outline"
          pending={transfersQuery.isFetching}
          onClick={() => void transfersQuery.refetch()}
        >
          <Trans>Try again</Trans>
        </Button>
      </DeskPanel>
    );
  } else {
    body = (
      <DeskTable
        label={t`Activity`}
        rows={visibleTransfers}
        columns={columns}
        rowKey={(transfer) => activityRowKey(transfer)}
        empty={<Trans>No activity yet.</Trans>}
        renderRow={(transfer, props, cells) => (
          <Link to="/" search={{ tab: "activity", tx: activityRowKey(transfer) }} {...props}>
            {cells}
          </Link>
        )}
      />
    );
  }

  const content = (
    <div className="grid gap-2">
      {body}
      {accountAddress && hasMoreTransfers ? (
        <Button
          variant="outline"
          className="justify-self-start"
          pending={transfersQuery.isFetchingNextPage}
          onClick={loadMore}
        >
          {transfersQuery.isFetchingNextPage ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
        </Button>
      ) : null}
    </div>
  );

  if (layout === "panel") return content;
  return <DeskSection title={<Trans>Activity</Trans>}>{content}</DeskSection>;
}
