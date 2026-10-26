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
import { RiCoinLine, RiSendPlane2Line } from "react-icons/ri";
import { toast } from "sonner";
import type { z } from "zod";
import { isAddress } from "viem";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import {
  FailureCross,
  PendingClock,
  ShareReceiptButton,
  SignedAmount,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { PoolMain } from "#/desktop/pools/pool-main";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";
import { usePoolSwapSettlement } from "#/features/pools/hooks/use-pool-swap-settlement";
import { swapReceiptSearchSchema } from "#/features/pools/swap-receipt-search";
import { PoolSwapFeeValue } from "#/features/pools/ui/pool-swap-fee-value";
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
    <div className="flex h-full min-h-0">
      <DeskSplit
        dimmed
        main={<PoolMain poolAddress={poolAddress} />}
        side={<SwapReceiptColumn poolAddress={poolAddress} details={details} />}
      />
    </div>
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
    <DeskInspector
      title={t`Swapped`}
      footer={
        <div className="flex flex-col gap-2">
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
              <Button asChild tap className="w-full">
                <Link to="/wallet/send/amount" search={redeemReceived}>
                  <RiCoinLine aria-hidden="true" />
                  <Trans>Redeem</Trans>
                </Link>
              </Button>
            ) : (
              <Button tap className="w-full" disabled>
                <RiCoinLine aria-hidden="true" />
                <Trans>Redeem</Trans>
              </Button>
            )
          ) : null}
          {sendReceived ? (
            <Button asChild tap className="w-full" variant="outline">
              <Link to="/wallet/send" search={sendReceived}>
                <RiSendPlane2Line aria-hidden="true" />
                <Trans>Send {details.receiveSymbol}</Trans>
              </Link>
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button
              tap
              className="flex-1"
              variant={sendReceived ? "outline" : "default"}
              onClick={exitReceipt}
            >
              <Trans>Done</Trans>
            </Button>
            {explorerUrl ? (
              <Button asChild tap className="flex-1" variant="outline">
                <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
                  {CHAIN_INFO.explorerName}
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-col items-center text-center">
        <SuccessCheck />
        {amountLabel ? (
          <p className="mt-3 font-mono font-semibold text-primary">{amountLabel}</p>
        ) : null}
      </div>
      <div className="border border-border">
        {amountLabel ? (
          <ReceiptRow label={<Trans>You receive</Trans>}>
            <SignedAmount direction="in" amount={amountLabel} />
          </ReceiptRow>
        ) : null}
        {sentLabel ? (
          <ReceiptRow label={<Trans>You send</Trans>}>
            <SignedAmount direction="out" amount={sentLabel} />
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={<Trans>Pool fee</Trans>}>
          <PoolSwapFeeValue
            breakdown={feeBreakdown}
            part="pool"
            decimals={feeDecimals}
            symbol={details.receiveSymbol}
            locale={locale}
            pending={settlement.isFetching}
            amountRaw={
              settlement.data?.source === "legacy" ? settlement.data.poolFeeRaw : undefined
            }
          />
        </ReceiptRow>
        <ReceiptRow label={<Trans>Protocol fee</Trans>}>
          <PoolSwapFeeValue
            breakdown={feeBreakdown}
            part="protocol"
            decimals={feeDecimals}
            symbol={details.receiveSymbol}
            locale={locale}
            pending={settlement.isFetching}
          />
        </ReceiptRow>
        <ReceiptRow label={<Trans>Total fees</Trans>}>
          <PoolSwapFeeValue
            breakdown={feeBreakdown}
            part="total"
            decimals={feeDecimals}
            symbol={details.receiveSymbol}
            locale={locale}
            pending={settlement.isFetching}
          />
        </ReceiptRow>
        {details.poolName ? (
          <ReceiptRow label={<Trans>Pool</Trans>}>
            <span className="min-w-0 break-words text-end text-xs font-semibold">
              {details.poolName}
            </span>
          </ReceiptRow>
        ) : null}
        {txHash ? (
          <ReceiptRow label={<Trans>Transaction</Trans>}>
            <CopyableInfoValue value={txHash} label={t`Copy transaction hash`} onCopy={copy} />
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={<Trans>Network</Trans>}>
          <span className="text-xs font-semibold">{CHAIN_INFO.name}</span>
        </ReceiptRow>
        {submittedAt ? (
          <ReceiptRow label={<Trans>Submitted</Trans>}>
            <time className="font-mono text-xs font-semibold" dateTime={submittedAt}>
              {formatSubmittedAt(submittedAt, locale)}
            </time>
          </ReceiptRow>
        ) : null}
        <StatusRow status={<StatusPill tone="success" label={t`Confirmed`} />} />
      </div>
      {settlement.data?.source === "legacy" ? (
        <p role="status" className="mt-2 text-muted-foreground text-xs">
          <Trans>Complete fee details are unavailable for this swap.</Trans>
        </p>
      ) : (!settlement.data && (!settlement.canLoad || settlement.isError)) ||
        feeDecimals === undefined ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p role="alert" className="text-muted-foreground text-xs">
            <Trans>Fee details unavailable.</Trans>
          </p>
          {settlement.isError ? (
            <Button
              variant="outline"
              tap
              pending={settlement.isFetching}
              onClick={() => void settlement.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
    </DeskInspector>
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
    <DeskInspector
      title={title}
      footer={
        onDone ? (
          <Button tap className="w-full" onClick={onDone}>
            <Trans>Done</Trans>
          </Button>
        ) : null
      }
    >
      <div className="mb-4 flex flex-col items-center text-center">
        {icon}
        {amount ? <p className="mt-3 font-mono font-semibold text-primary">{amount}</p> : null}
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
      </div>
      <div className="border border-border">
        {poolName ? (
          <ReceiptRow label={<Trans>Pool</Trans>}>
            <span className="min-w-0 break-words text-end text-xs font-semibold">{poolName}</span>
          </ReceiptRow>
        ) : null}
        <StatusRow status={status} />
      </div>
    </DeskInspector>
  );
}

function ReceiptRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-border border-b px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function StatusRow({ status }: { status: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-muted-foreground text-xs">
        <Trans>Status</Trans>
      </span>
      {status}
    </div>
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
