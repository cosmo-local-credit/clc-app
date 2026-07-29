import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiCloseLine, RiFileCopyLine, RiTimeLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { EllipsizedAddress, SignedAmount, SuccessCheck } from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { RELAYER_URL } from "#/lib/backend-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type SwapReceiptSearch = {
  trackingId?: string;
  sendAmount?: string;
  sendSymbol?: string;
  receiveAmount?: string;
  receiveSymbol?: string;
  poolName?: string;
};

export function SwapReceiptPage({
  poolAddress,
  details,
}: {
  poolAddress: string;
  details: SwapReceiptSearch;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const tracking = useOtxTracking(details.trackingId ?? null, {
    queryKey: "pool-swap-relay-track",
    queryFn: async (trackingId) => (await relayerClient.trackRelay(trackingId)).result,
  });
  const amountLabel =
    details.receiveAmount && details.receiveSymbol
      ? `${details.receiveAmount} ${details.receiveSymbol}`
      : null;
  const sentLabel =
    details.sendAmount && details.sendSymbol ? `${details.sendAmount} ${details.sendSymbol}` : null;
  const exitReceipt = () => {
    void navigate({
      to: "/pools/$poolAddress",
      params: { poolAddress },
      replace: true,
    });
  };

  if (!details.trackingId) {
    return (
      <ReceiptShell
        icon={<ErrorIcon />}
        title={t`Swap unavailable`}
        amount={amountLabel}
        message={t`Swap tracking details are missing.`}
        poolName={details.poolName}
        status={<Status tone="error" label={t`Unavailable`} />}
        onDone={exitReceipt}
      />
    );
  }

  const outcome = tracking.outcome;
  if (outcome.kind === "pending") {
    return (
      <ReceiptShell
        icon={<PendingIcon />}
        title={t`Swapping`}
        amount={amountLabel}
        message={t`Waiting for on-chain confirmation`}
        poolName={details.poolName}
        status={<Status tone="pending" label={t`Pending`} />}
        onDone={exitReceipt}
      />
    );
  }
  if (outcome.kind === "error") {
    return (
      <ReceiptShell
        icon={<ErrorIcon />}
        title={t`Swap reverted`}
        amount={amountLabel}
        message={outcome.error}
        poolName={details.poolName}
        status={<Status tone="error" label={t`Reverted`} />}
        onDone={exitReceipt}
      />
    );
  }

  const txHash = outcome.otx.txHash || null;
  const explorerUrl = txHash ? `https://celoscan.io/tx/${txHash}` : null;
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
        {sentLabel ? (
          <ReceiptRow label={<Trans>From</Trans>}>
            <SignedAmount direction="out" amount={sentLabel} />
          </ReceiptRow>
        ) : null}
        {amountLabel ? (
          <ReceiptRow label={<Trans>To</Trans>}>
            <SignedAmount direction="in" amount={amountLabel} />
          </ReceiptRow>
        ) : null}
        {details.poolName ? (
          <ReceiptRow label={<Trans>Pool</Trans>}>
            <span className="min-w-0 break-words text-right text-xs font-semibold">
              {details.poolName}
            </span>
          </ReceiptRow>
        ) : null}
        {txHash ? (
          <ReceiptRow label={<Trans>Transaction</Trans>}>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 bg-card text-right"
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
          <span className="text-xs font-semibold">Celo</span>
        </ReceiptRow>
        {submittedAt ? (
          <ReceiptRow label={<Trans>Submitted</Trans>}>
            <time className="font-mono text-xs font-semibold" dateTime={submittedAt}>
              {formatSubmittedAt(submittedAt)}
            </time>
          </ReceiptRow>
        ) : null}
        <StatusRow status={<Status tone="success" label={t`Confirmed`} />} />
      </div>
      <div className="flex-1" />
      <div className="flex gap-3">
        <Button className="h-11 flex-1" onClick={exitReceipt}>
          <Trans>Done</Trans>
        </Button>
        {explorerUrl ? (
          <Button asChild className="h-11 flex-1" variant="outline">
            <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
              Celoscan
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
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <ReceiptHeader icon={icon} title={title} amount={amount} message={message} />
      <div className="my-5 border border-border bg-card">
        {poolName ? (
          <ReceiptRow label={<Trans>Pool</Trans>}>
            <span className="min-w-0 break-words text-right text-xs font-semibold">{poolName}</span>
          </ReceiptRow>
        ) : null}
        <StatusRow status={status} />
      </div>
      <div className="flex-1" />
      <Button className="h-11 w-full" onClick={onDone}>
        <Trans>Done</Trans>
      </Button>
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

function Status({ tone, label }: { tone: "success" | "pending" | "error"; label: string }) {
  const color =
    tone === "error"
      ? "text-destructive"
      : tone === "pending"
        ? "text-[oklch(0.58_0.14_70)]"
        : "text-primary";
  const dot =
    tone === "error"
      ? "bg-destructive"
      : tone === "pending"
        ? "bg-[oklch(0.74_0.16_80)]"
        : "bg-primary";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${color}`}>
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function PendingIcon() {
  return (
    <span
      className="flex items-center justify-center rounded-full border border-[oklch(0.74_0.16_80)]/40 bg-[oklch(0.74_0.16_80)]/10 text-[oklch(0.58_0.14_70)]"
      style={{ width: 56, height: 56 }}
    >
      <RiTimeLine className="size-7" aria-hidden="true" />
    </span>
  );
}

function ErrorIcon() {
  return (
    <span
      className="flex items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
      style={{ width: 56, height: 56 }}
    >
      <RiCloseLine className="size-7" aria-hidden="true" />
    </span>
  );
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}
