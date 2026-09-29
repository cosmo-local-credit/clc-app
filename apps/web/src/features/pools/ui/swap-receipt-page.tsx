import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { RiFileCopyLine, RiSendPlane2Line } from "react-icons/ri";
import { toast } from "sonner";
import { formatTokenAmountFixed, parseTokenAmount } from "@clc/core/features/wallet/logic";

import { Button } from "#/components/ui/button";
import {
  EllipsizedAddress,
  FailureCross,
  PendingClock,
  SignedAmount,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";
import { CHAIN_INFO } from "#/lib/chain";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";

const relayerClient = createRelayerClient(RELAYER_URL);

export type SwapReceiptSearch = {
  trackingId?: string;
  sendAmount?: string;
  sendSymbol?: string;
  receiveAmount?: string;
  receiveSymbol?: string;
  receiveToken?: string;
  poolName?: string;
};

export function SwapReceiptPage({
  poolAddress,
  details,
}: {
  poolAddress: string;
  details: SwapReceiptSearch;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const tracking = useOtxTracking(details.trackingId ?? null, {
    queryKey: "pool-swap-relay-track",
    queryFn: async (trackingId) => (await relayerClient.trackRelay(trackingId)).result,
  });
  const localizedReceiveAmount = details.receiveAmount
    ? localizeCanonicalAmount(details.receiveAmount, i18n.locales?.[0] ?? i18n.locale)
    : null;
  const localizedSendAmount = details.sendAmount
    ? localizeCanonicalAmount(details.sendAmount, i18n.locales?.[0] ?? i18n.locale)
    : null;
  const amountLabel =
    localizedReceiveAmount && details.receiveSymbol
      ? `${localizedReceiveAmount} ${details.receiveSymbol}`
      : null;
  const sentLabel =
    localizedSendAmount && details.sendSymbol
      ? `${localizedSendAmount} ${details.sendSymbol}`
      : null;
  const exitReceipt = () => {
    void navigate({
      to: "/pools/$poolAddress",
      params: { poolAddress },
      replace: true,
    });
  };
  // Sending what was just swapped out is the common next step, so the receipt
  // hands the send flow its token and amount already chosen and the user only
  // picks a recipient. Offered only once the swap confirmed and only when the
  // received token is known — a prefill missing either half would silently open
  // the flow on some other voucher.
  const sendReceived =
    details.receiveToken && details.receiveAmount
      ? { token: details.receiveToken, amount: details.receiveAmount }
      : null;

  if (!details.trackingId) {
    return (
      <ReceiptShell
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

  const outcome = tracking.outcome;
  if (outcome.kind === "pending") {
    return (
      <ReceiptShell
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
      <ReceiptShell
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

  const txHash = outcome.otx.txHash || null;
  const explorerUrl = txHash ? explorerTxUrl(CHAIN_INFO, txHash) : null;
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
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <ReceiptHeader title={t`Swapped`} />
      <div className="my-5 border border-border bg-card">
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
        {details.poolName ? (
          <ReceiptRow label={<Trans>Pool</Trans>}>
            <span className="min-w-0 break-words text-end text-xs font-semibold">
              {details.poolName}
            </span>
          </ReceiptRow>
        ) : null}
        {txHash ? (
          <ReceiptRow label={<Trans>Transaction</Trans>}>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 bg-card text-end"
              aria-label={t`Copy transaction hash`}
              onClick={() => copy(txHash)}
            >
              <EllipsizedAddress address={txHash} />
              <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                <RiFileCopyLine className="size-3" aria-hidden="true" />
              </span>
            </button>
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={<Trans>Network</Trans>}>
          <span className="text-xs font-semibold">{CHAIN_INFO.name}</span>
        </ReceiptRow>
        {submittedAt ? (
          <ReceiptRow label={<Trans>Submitted</Trans>}>
            <time className="font-mono text-xs font-semibold" dateTime={submittedAt}>
              {formatSubmittedAt(submittedAt, i18n.locales?.[0] ?? i18n.locale)}
            </time>
          </ReceiptRow>
        ) : null}
        <StatusRow status={<StatusPill tone="success" label={t`Confirmed`} />} />
      </div>
      <div className="flex-1" />
      {sendReceived ? (
        <Button asChild className="mb-2.5 h-11 w-full">
          <Link to="/wallet/send" search={sendReceived}>
            <RiSendPlane2Line className="size-4" aria-hidden="true" />
            <Trans>Send {details.receiveSymbol}</Trans>
          </Link>
        </Button>
      ) : null}
      <div className="flex gap-3">
        <Button
          className="h-11 flex-1"
          variant={sendReceived ? "outline" : "default"}
          onClick={exitReceipt}
        >
          <Trans>Done</Trans>
        </Button>
        {explorerUrl ? (
          <Button asChild className="h-11 flex-1" variant="outline">
            <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
              {CHAIN_INFO.explorerName}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ReceiptShell({
  icon,
  title,
  amount,
  message,
  poolName,
  status,
  onDone,
}: {
  icon: React.ReactNode;
  title: string;
  amount: string | null;
  message: React.ReactNode;
  poolName?: string;
  status: React.ReactNode;
  /**
   * Omitted while the swap is still settling. The screen replaces itself with
   * the outcome the moment the chain answers, and a Done button sitting there
   * meanwhile is a way to leave before ever seeing whether the swap landed.
   */
  onDone?: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <ReceiptHeader icon={icon} title={title} amount={amount} message={message} />
      <div className="my-5 border border-border bg-card">
        {poolName ? (
          <ReceiptRow label={<Trans>Pool</Trans>}>
            <span className="min-w-0 break-words text-end text-xs font-semibold">{poolName}</span>
          </ReceiptRow>
        ) : null}
        <StatusRow status={status} />
      </div>
      <div className="flex-1" />
      {onDone ? (
        <Button className="h-11 w-full" onClick={onDone}>
          <Trans>Done</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function ReceiptHeader({
  icon = <SuccessCheck />,
  title,
  amount = null,
  message,
}: {
  icon?: React.ReactNode;
  title: string;
  amount?: string | null;
  message?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {icon}
      <h1
        aria-label={amount ? `${title} ${amount}` : title}
        className="font-heading mt-3.5 flex flex-col items-center gap-1 text-[1.75rem] font-bold leading-tight"
      >
        <span>{title}</span>
        {amount ? <span className="break-words text-primary">{amount}</span> : null}
      </h1>
      {message ? <p className="mt-2 text-muted-foreground text-sm">{message}</p> : null}
    </div>
  );
}

function ReceiptRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function StatusRow({ status }: { status: React.ReactNode }) {
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
  try {
    return formatTokenAmountFixed(parseTokenAmount(amount, 2), 2, 2, locale);
  } catch {
    return amount;
  }
}
