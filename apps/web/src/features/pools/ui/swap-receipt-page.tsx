import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiCloseLine, RiTimeLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { SuccessCheck } from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { RELAYER_URL } from "#/lib/backend-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type SwapReceiptSearch = {
  placeholder?: boolean;
  trackingId?: string;
  receiveAmount?: string;
  receiveSymbol?: string;
  poolName?: string;
  submittedAt?: string;
};

export function SwapReceiptPage({ details }: { details: SwapReceiptSearch }) {
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
  const goToPools = () => {
    void navigate({ to: "/", search: { tab: "pool" } });
  };

  if (details.trackingId) {
    const outcome = tracking.outcome;
    if (outcome.kind === "pending") {
      return (
        <ReceiptShell
          icon={<PendingIcon />}
          title={t`Swap pending`}
          amount={amountLabel}
          message={t`Waiting for on-chain confirmation`}
          status={<Status tone="pending" label={t`Pending`} />}
          onDone={goToPools}
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
          status={<Status tone="error" label={t`Reverted`} />}
          onDone={goToPools}
        />
      );
    }

    const txHash = outcome.otx.txHash || null;
    const explorerUrl = txHash ? `https://celoscan.io/tx/${txHash}` : null;
    return (
      <ConfirmedReceipt
        title={t`Swap confirmed`}
        amount={amountLabel}
        poolName={details.poolName}
        integrationStatus={txHash ?? t`Tracked transaction`}
        network="Celo"
        submittedAt={outcome.otx.createdAt}
        status={t`Confirmed`}
        explorerUrl={explorerUrl}
        onDone={goToPools}
      />
    );
  }

  return (
    <ConfirmedReceipt
      title={t`Swap confirmed`}
      amount={amountLabel}
      poolName={details.poolName}
      integrationStatus={
        details.placeholder ? t`Pending endpoint integration` : t`No tracking data`
      }
      submittedAt={details.submittedAt}
      status={details.placeholder ? t`Placeholder confirmed` : t`Confirmed`}
      onDone={goToPools}
    />
  );
}

function ConfirmedReceipt({
  title,
  amount,
  poolName,
  integrationStatus,
  network,
  submittedAt,
  status,
  explorerUrl,
  onDone,
}: {
  title: string;
  amount: string | null;
  poolName?: string;
  integrationStatus: string;
  network?: string;
  submittedAt?: string;
  status: string;
  explorerUrl?: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <ReceiptHeader title={title} amount={amount} />
      <div className="my-5 border border-border bg-card">
        {poolName ? <ReceiptRow label={<Trans>Pool</Trans>} value={poolName} /> : null}
        <ReceiptRow label={<Trans>Transaction</Trans>} value={integrationStatus} />
        {network ? <ReceiptRow label={<Trans>Network</Trans>} value={network} /> : null}
        {submittedAt ? (
          <ReceiptRow label={<Trans>Submitted</Trans>}>
            <time
              className="min-w-0 break-words text-right font-mono text-xs font-semibold"
              dateTime={submittedAt}
            >
              {formatSubmittedAt(submittedAt)}
            </time>
          </ReceiptRow>
        ) : null}
        <StatusRow status={<Status tone="success" label={status} />} />
      </div>
      <div className="flex-1" />
      <ReceiptActions explorerUrl={explorerUrl} onDone={onDone} />
    </div>
  );
}

function ReceiptShell({
  icon,
  title,
  amount,
  message,
  status,
  onDone,
}: {
  icon: React.ReactNode;
  title: string;
  amount: string | null;
  message: React.ReactNode;
  status: React.ReactNode;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <ReceiptHeader icon={icon} title={title} amount={amount} message={message} />
      <div className="my-5 border border-border bg-card">
        <StatusRow status={status} />
      </div>
      <div className="flex-1" />
      <Button className="h-11 w-full" onClick={onDone}>
        <Trans>Done to Pools</Trans>
      </Button>
    </div>
  );
}

function ReceiptHeader({
  icon = <SuccessCheck />,
  title,
  amount,
  message,
}: {
  icon?: React.ReactNode;
  title: string;
  amount: string | null;
  message?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {icon}
      <h1 className="font-heading mt-3.5 flex flex-col items-center gap-1 text-[1.75rem] font-bold leading-tight">
        <span>{title}</span>
        {amount ? <span className="break-words text-primary">{amount}</span> : null}
      </h1>
      {message ? <p className="mt-2 text-muted-foreground text-sm">{message}</p> : null}
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  children,
}: {
  label: React.ReactNode;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      {children ?? (
        <span className="min-w-0 break-words text-right text-xs font-semibold">{value}</span>
      )}
    </div>
  );
}

function StatusRow({ status }: { status: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-muted-foreground text-xs">
        <Trans>Status</Trans>
      </span>
      {status}
    </div>
  );
}

function ReceiptActions({
  explorerUrl,
  onDone,
}: {
  explorerUrl?: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Button className="h-11 flex-1" onClick={onDone}>
        <Trans>Done to Pools</Trans>
      </Button>
      {explorerUrl ? (
        <Button asChild className="h-11 flex-1" variant="outline">
          <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
            Celoscan
          </a>
        </Button>
      ) : null}
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
