import { createRelayerClient } from "@clc/api/features/relayer/client";
import { formatOfferingDisplayValue } from "@clc/core/features/market/logic";
import {
  formatPoolSwapFeePercentage,
  type PoolSwapFeeBreakdownRaw,
} from "@clc/core/features/pool-swaps/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { isAddress } from "viem";

import { Button } from "#/components/ui/button";
import {
  FailureCross,
  PendingClock,
  ShareReceiptButton,
  SignedAmount,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { SectionHeading } from "#/components/ui/section-heading";
import { FullValue } from "#/desktop/ui/full-value";
import { DeskSwapFee } from "#/desktop/pools/detail/desk-swap-fee";
import { PoolDeskFrame } from "#/desktop/pools/pool-desk";
import { DeskKV } from "#/desktop/ui/kv";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";
import { usePoolSwapSettlement } from "#/features/pools/hooks/use-pool-swap-settlement";
import { swapReceiptSearchSchema } from "#/features/pools/swap-receipt-search";
import { formatTransferUnitValue } from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type SwapReceiptDetails = z.infer<typeof swapReceiptSearchSchema>;

export function SwapReceiptDesk({
  poolAddress,
  details,
}: {
  poolAddress: string;
  details: SwapReceiptDetails;
}) {
  return (
    <PoolDeskFrame
      dimmed
      poolAddress={poolAddress}
      side={<SwapReceiptColumn poolAddress={poolAddress} details={details} />}
    />
  );
}

function SwapReceiptColumn({
  poolAddress,
  details,
}: {
  poolAddress: string;
  details: SwapReceiptDetails;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const tracking = useOtxTracking(details.trackingId ?? null, {
    queryKey: "pool-swap-relay-track",
    queryFn: async (trackingId) => (await relayerClient.trackRelay(trackingId)).result,
  });
  const outcome = tracking.outcome;
  const txHash = outcome.kind === "success" ? outcome.otx.txHash || undefined : undefined;
  const sentToken =
    details.sendToken && isAddress(details.sendToken) ? details.sendToken : undefined;
  const receivedToken =
    details.receiveToken && isAddress(details.receiveToken) ? details.receiveToken : undefined;
  const receivedVoucher = useMarketVoucherDetail(
    details.trackingId && outcome.kind === "success" ? receivedToken : undefined,
  );
  const settlement = usePoolSwapSettlement({
    txHash,
    poolAddress,
    tokenIn: sentToken,
    tokenOut: receivedToken,
  });
  const feeDecimals = details.receiveDecimals;
  const feeBreakdown = settlement.data?.source === "settlement" ? settlement.data.breakdown : null;
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const localizedReceiveAmount = details.receiveAmount
    ? localizeCanonicalAmount(details.receiveAmount, locale)
    : null;
  const localizedSendAmount = details.sendAmount
    ? localizeCanonicalAmount(details.sendAmount, locale)
    : null;
  const receiveUnitValue =
    formatTransferUnitValue(details.receiveUoaValue, details.receiveUoa, locale) ??
    (details.receiveUoaUnavailable ? t`Unavailable` : null);
  const sendUnitValue =
    formatTransferUnitValue(details.sendUoaValue, details.sendUoa, locale) ??
    (details.sendUoaUnavailable ? t`Unavailable` : null);
  const amountLabel =
    localizedReceiveAmount && details.receiveSymbol
      ? `${localizedReceiveAmount} ${details.receiveSymbol}${receiveUnitValue ? ` (${receiveUnitValue})` : ""}`
      : null;
  const sentLabel =
    localizedSendAmount && details.sendSymbol
      ? `${localizedSendAmount} ${details.sendSymbol}${sendUnitValue ? ` (${sendUnitValue})` : ""}`
      : null;
  const exitReceipt = () => {
    void navigate({ to: "/pools/$poolAddress", params: { poolAddress }, replace: true });
  };
  const sendReceived =
    receivedToken && details.receiveAmount
      ? { token: receivedToken, amount: details.receiveAmount }
      : null;
  const issuerAddress = receivedVoucher.data?.ownerAddress;
  const redeemReceived =
    sendReceived && issuerAddress && isAddress(issuerAddress)
      ? { ...sendReceived, recipient: issuerAddress }
      : null;

  if (!details.trackingId) {
    return (
      <ReceiptColumn
        icon={<FailureCross />}
        title={t`Swap unavailable`}
        amount={amountLabel}
        message={t`Swap tracking details are missing.`}
        poolName={details.poolName}
        status={<StatusPill tone="error" label={t`Unavailable`} />}
        onDone={exitReceipt}
      />
    );
  }
  if (outcome.kind === "pending") {
    return (
      <ReceiptColumn
        icon={<PendingClock />}
        title={t`Swapping`}
        amount={amountLabel}
        message={t`Waiting for on-chain confirmation`}
        poolName={details.poolName}
        status={<StatusPill tone="pending" label={t`Pending`} />}
      />
    );
  }
  if (outcome.kind === "error") {
    return (
      <ReceiptColumn
        icon={<FailureCross />}
        title={t`Swap reverted`}
        amount={amountLabel}
        message={outcome.error}
        poolName={details.poolName}
        status={<StatusPill tone="error" label={t`Reverted`} />}
        onDone={exitReceipt}
      />
    );
  }

  const explorerUrl = txHash ? explorerTxUrl(CHAIN_INFO, txHash) : null;
  const poolName = details.poolName;
  const submittedAt = outcome.otx.createdAt || null;
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
    <ReceiptPanel
      icon={<SuccessCheck />}
      title={t`Swapped`}
      subtitle={
        submittedAt ? (
          <time dateTime={submittedAt}>{formatSubmittedAt(submittedAt, locale)}</time>
        ) : null
      }
    >
      <DeskKV
        rows={[
          amountLabel
            ? [
                <Trans key="label">You receive</Trans>,
                <SignedAmount key="value" direction="in" amount={amountLabel} />,
              ]
            : null,
          sentLabel
            ? [
                <Trans key="label">You send</Trans>,
                <SignedAmount key="value" direction="out" amount={sentLabel} />,
              ]
            : null,
          [
            <Trans key="label">Pool fee</Trans>,
            <DeskSwapFee
              key="value"
              breakdown={feeBreakdown}
              part="pool"
              decimals={feeDecimals}
              symbol={details.receiveSymbol}
              locale={locale}
              pending={settlement.isFetching}
              amountRaw={
                settlement.data?.source === "legacy" ? settlement.data.poolFeeRaw : undefined
              }
            />,
          ],
          [
            <Trans key="label">Protocol fee</Trans>,
            <DeskSwapFee
              key="value"
              breakdown={feeBreakdown}
              part="protocol"
              decimals={feeDecimals}
              symbol={details.receiveSymbol}
              locale={locale}
              pending={settlement.isFetching}
            />,
          ],
          [
            <Trans key="label">Total fees</Trans>,
            <DeskSwapFee
              key="value"
              breakdown={feeBreakdown}
              part="total"
              decimals={feeDecimals}
              symbol={details.receiveSymbol}
              locale={locale}
              pending={settlement.isFetching}
            />,
          ],
          details.poolName
            ? [
                <Trans key="label">Pool</Trans>,
                <span key="value" dir="auto" className="font-sans">
                  {details.poolName}
                </span>,
              ]
            : null,
          txHash
            ? [
                <Trans key="label">Transaction</Trans>,
                <FullValue
                  key="value"
                  value={txHash}
                  copyLabel={t`Copy transaction hash`}
                  onCopy={copy}
                />,
              ]
            : null,
          [
            <Trans key="label">Network</Trans>,
            explorerUrl ? (
              <a
                key="value"
                href={explorerUrl}
                rel="noopener noreferrer"
                target="_blank"
                className="font-sans text-primary hover:underline"
              >
                {CHAIN_INFO.name}
              </a>
            ) : (
              <span key="value" className="font-sans">
                {CHAIN_INFO.name}
              </span>
            ),
          ],
          [
            <Trans key="label">Status</Trans>,
            <StatusPill key="value" tone="success" label={t`Confirmed`} className="font-sans" />,
          ],
        ]}
      />
      {settlement.data?.source === "legacy" ? (
        <p role="status" className="text-xs text-muted-foreground">
          <Trans>Complete fee details are unavailable for this swap.</Trans>
        </p>
      ) : (!settlement.data && (!settlement.canLoad || settlement.isError)) ||
        feeDecimals === undefined ? (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-xs text-muted-foreground">
            <Trans>Fee details unavailable.</Trans>
          </p>
          {settlement.isError ? (
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
      <div className="grid grid-cols-2 gap-2">
        {explorerUrl ? (
          <ShareReceiptButton
            className="w-full"
            title={t`Swap receipt`}
            lines={[
              amountLabel && sentLabel
                ? poolName
                  ? t`I swapped ${sentLabel} for ${amountLabel} in ${poolName}.`
                  : t`I swapped ${sentLabel} for ${amountLabel}.`
                : t`I made a swap.`,
              ...feeShareLines({
                breakdown: feeBreakdown,
                decimals: feeDecimals,
                symbol: details.receiveSymbol,
                locale,
                labels: { pool: t`Pool fee`, protocol: t`Protocol fee`, total: t`Total fees` },
              }),
              ...(submittedAt ? [formatSubmittedAt(submittedAt, locale)] : []),
            ]}
            url={explorerUrl}
          />
        ) : null}
        {sendReceived ? (
          redeemReceived ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/wallet/send/amount" search={redeemReceived}>
                <Trans>Redeem</Trans>
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              <Trans>Redeem</Trans>
            </Button>
          )
        ) : null}
        {sendReceived ? (
          <Button asChild variant="outline" className="w-full min-w-0">
            <Link to="/wallet/send" search={sendReceived}>
              <span className="truncate">
                <Trans>Send {details.receiveSymbol}</Trans>
              </span>
            </Link>
          </Button>
        ) : null}
        <Button className="w-full" onClick={exitReceipt}>
          <Trans>Done</Trans>
        </Button>
      </div>
    </ReceiptPanel>
  );
}

function ReceiptColumn({
  icon,
  title,
  amount,
  message,
  poolName,
  status,
  onDone,
}: {
  icon: ReactNode;
  title: string;
  amount: string | null;
  message: ReactNode;
  poolName?: string;
  status: ReactNode;
  onDone?: () => void;
}) {
  return (
    <ReceiptPanel icon={icon} title={title} subtitle={message}>
      <DeskKV
        rows={[
          amount
            ? [
                <Trans key="label">You receive</Trans>,
                <span key="value" dir="ltr">
                  {amount}
                </span>,
              ]
            : null,
          poolName
            ? [
                <Trans key="label">Pool</Trans>,
                <span key="value" dir="auto" className="font-sans">
                  {poolName}
                </span>,
              ]
            : null,
          [
            <Trans key="label">Status</Trans>,
            <span key="value" className="font-sans">
              {status}
            </span>,
          ],
        ]}
      />
      {onDone ? (
        <Button className="w-full" onClick={onDone}>
          <Trans>Done</Trans>
        </Button>
      ) : null}
    </ReceiptPanel>
  );
}

/** The receipt in the side column: a 56px status badge beside the title, then the rows. */
function ReceiptPanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="desk-swap-receipt-title"
      className="grid min-w-0 gap-3.5 border border-border bg-card p-4"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {icon}
        <div className="min-w-0">
          <SectionHeading as="h2" variant="section" id="desk-swap-receipt-title">
            {title}
          </SectionHeading>
          {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function formatSubmittedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function localizeCanonicalAmount(amount: string, locale: string): string {
  return formatOfferingDisplayValue(amount, locale) ?? amount;
}

function feeShareLines({
  breakdown,
  decimals,
  symbol,
  locale,
  labels,
}: {
  breakdown: PoolSwapFeeBreakdownRaw | null;
  decimals: number | undefined;
  symbol: string | undefined;
  locale: string;
  labels: { pool: string; protocol: string; total: string };
}): string[] {
  if (!breakdown || decimals === undefined || !symbol) return [];
  return (
    [
      [labels.pool, breakdown.poolFeeRaw],
      [labels.protocol, breakdown.protocolFeeRaw],
      [labels.total, breakdown.totalFeeRaw],
    ] as const
  ).map(([label, feeRaw]) => {
    const amount = formatPoolSwapFee(feeRaw, decimals, locale);
    const percentage = formatPoolSwapFeePercentage({
      feeRaw,
      grossAmountOutRaw: breakdown.grossAmountOutRaw,
      locale,
    });
    return `${label}: ${amount} ${symbol}${percentage ? ` (${percentage})` : ""}`;
  });
}
