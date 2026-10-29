import { Trans, useLingui } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SignedAmount } from "#/components/wallet";
import { copyValue, FullValue } from "#/desktop/ui/full-value";
import { DeskSwapFee } from "#/desktop/pools/detail/desk-swap-fee";
import { PoolSidePanel } from "#/desktop/pools/detail/pool-side-panel";
import { DeskKV } from "#/desktop/ui/kv";
import {
  legAmount,
  usePoolActivityDetails,
} from "#/features/pools/hooks/use-pool-activity-details";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";

/** One pool event in the side column: its legs, fees, parties and transaction. */
export function PoolActivityDetailSide({
  poolAddress,
  entry,
  onClose,
}: {
  poolAddress: string;
  entry: PoolActivityEntry;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { locale, settlement, feeBreakdown, explorerUrl, kind, copy } = usePoolActivityDetails({
    poolAddress,
    entry,
    open: true,
  });
  const swap = entry.kind === "swap" ? entry : null;
  const copyAddress = (value: string) =>
    copyValue(value, t`Address copied`, t`Couldn't copy address`);
  const fee = (part: "pool" | "protocol" | "total", pending: boolean, amountRaw?: string | null) =>
    swap ? (
      <DeskSwapFee
        breakdown={feeBreakdown}
        part={part}
        decimals={swap.sent.tokenDecimals}
        symbol={swap.sent.tokenSymbol}
        locale={locale}
        pending={pending}
        amountRaw={amountRaw}
      />
    ) : null;
  return (
    <PoolSidePanel
      title={kind}
      onClose={onClose}
      focus="offscreen"
      footer={
        <Button asChild>
          <a href={explorerUrl} target="_blank" rel="noreferrer">
            <Trans>View on block explorer</Trans>
          </a>
        </Button>
      }
    >
      <DeskKV
        labelWidth="130px"
        rows={[
          [
            <Trans key="label">Status</Trans>,
            <Badge key="value" variant={entry.success ? "primary" : "muted"} size="sm" caps>
              {entry.success ? t`Confirmed` : t`Failed`}
            </Badge>,
          ],
          ...(swap
            ? ([
                [
                  <Trans key="label">Pool received</Trans>,
                  <SignedAmount
                    key="value"
                    direction="in"
                    amount={legAmount(swap.received, locale)}
                  />,
                ],
                [
                  <Trans key="label">Pool paid out</Trans>,
                  <SignedAmount
                    key="value"
                    direction="out"
                    amount={legAmount(swap.sent, locale)}
                  />,
                ],
                [
                  <Trans key="label">Pool fee</Trans>,
                  fee(
                    "pool",
                    settlement.isFetching,
                    settlement.data?.source === "legacy" ? settlement.data.poolFeeRaw : undefined,
                  ),
                ],
                [
                  <Trans key="label">Protocol fee</Trans>,
                  fee(
                    "protocol",
                    settlement.isFetching && !swap.protocolFee,
                    swap.protocolFee?.amount,
                  ),
                ],
                [<Trans key="label">Total fees</Trans>, fee("total", settlement.isFetching)],
              ] as const)
            : entry.kind !== "swap"
              ? ([
                  [
                    <Trans key="label">Amount</Trans>,
                    <SignedAmount
                      key="value"
                      direction={entry.kind === "mint" || entry.direction === "IN" ? "in" : "out"}
                      amount={legAmount(entry.leg, locale)}
                    />,
                  ],
                ] as const)
              : []),
          [
            <Trans key="label">Voucher</Trans>,
            <span key="value" dir="auto" className="font-sans">
              {swap ? swap.sent.tokenName : entry.kind !== "swap" ? entry.leg.tokenName : ""}
            </span>,
          ],
          swap
            ? [
                <Trans key="label">Received voucher</Trans>,
                <span key="value" dir="auto" className="font-sans">
                  {swap.received.tokenName}
                </span>,
              ]
            : null,
          [
            <Trans key="label">From</Trans>,
            entry.kind === "mint" ? (
              <span key="value" className="font-sans">
                <Trans>New supply</Trans>
              </span>
            ) : (
              <FullValue
                key="value"
                value={entry.detail.senderAddress}
                copyLabel={t`Copy sender address`}
                onCopy={copyAddress}
              />
            ),
          ],
          [
            <Trans key="label">To</Trans>,
            <FullValue
              key="value"
              value={entry.detail.recipientAddress}
              copyLabel={t`Copy recipient address`}
              onCopy={copyAddress}
            />,
          ],
          [
            <Trans key="label">Date</Trans>,
            <time key="value" dateTime={entry.dateBlock}>
              {formatTransferDate(entry.dateBlock)}
            </time>,
          ],
          [
            <Trans key="label">Transaction</Trans>,
            <FullValue
              key="value"
              value={entry.txHash}
              copyLabel={t`Copy transaction hash`}
              onCopy={copy}
            />,
          ],
        ]}
      />
      {swap && settlement.data?.source === "legacy" && !feeBreakdown ? (
        <p role="status" className="text-xs text-muted-foreground">
          <Trans>Complete fee details are unavailable for this swap.</Trans>
        </p>
      ) : swap && !settlement.data && (!settlement.canLoad || settlement.isError) ? (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-xs text-muted-foreground">
            <Trans>Fee details unavailable.</Trans>
          </p>
          {settlement.canLoad ? (
            <Button
              variant="outline"
              pending={settlement.isFetching}
              onClick={() => void settlement.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
    </PoolSidePanel>
  );
}

/**
 * The row the URL names has not loaded, or is not in the feed. While older
 * pages may still hold it the page keeps loading them; past the last page it
 * says so.
 */
export function PoolActivityMissingSide({
  loading,
  onClose,
}: {
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <PoolSidePanel title={<Trans>Activity</Trans>} onClose={onClose} focus="offscreen">
      <p role="status" className="text-sm text-muted-foreground">
        {loading ? <Trans>Loading activity…</Trans> : <Trans>Activity not found.</Trans>}
      </p>
    </PoolSidePanel>
  );
}
