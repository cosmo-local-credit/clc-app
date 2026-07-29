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

function ReceiptRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function CopyableMono({
  value,
  label,
  onCopy,
}: {
  value: string;
  label: string;
  onCopy: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-1.5 bg-card text-right"
      aria-label={label}
      onClick={() => onCopy(value)}
    >
      <EllipsizedAddress address={value} />
      <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <RiFileCopyLine className="size-3" aria-hidden="true" />
      </span>
    </button>
  );
}

export function SendReceiptPage({
  trackingId,
  recipient,
  amount,
  symbol,
}: {
  trackingId?: string;
  recipient?: string;
  amount?: string;
  symbol?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const tracking = useOtxTracking(trackingId ?? null, {
    queryKey: "send-relay-track",
    queryFn: async (nextTrackingId) => (await relayerClient.trackRelay(nextTrackingId)).result,
  });
  const toAddress = recipient ?? null;
  const amountLabel = amount && symbol ? `${amount} ${symbol}` : null;
  const outcome = tracking.outcome;
  const goToWallet = () => {
    void navigate({ to: "/", search: { tab: "wallet" }, replace: true });
  };

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

  if (outcome.kind === "pending") {
    return (
      <ReceiptShell
        icon={
          <span
            className="flex items-center justify-center rounded-full border border-[oklch(0.74_0.16_80)]/40 bg-[oklch(0.74_0.16_80)]/10 text-[oklch(0.58_0.14_70)]"
            style={{ width: 56, height: 56 }}
          >
            <RiTimeLine className="size-7" aria-hidden="true" />
          </span>
        }
        title={<Trans>Sending</Trans>}
        amount={amountLabel}
        message={<Trans>Waiting for on-chain confirmation</Trans>}
        toAddress={toAddress}
        status={
          <span className="inline-flex items-center gap-1.5 text-[oklch(0.58_0.14_70)] text-xs font-semibold">
            <span className="size-2 rounded-full bg-[oklch(0.74_0.16_80)]" />
            <Trans>Pending</Trans>
          </span>
        }
        onDone={goToWallet}
      />
    );
  }

  if (outcome.kind === "error") {
    return (
      <ReceiptShell
        icon={
          <span
            className="flex items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
            style={{ width: 56, height: 56 }}
          >
            <RiCloseLine className="size-7" aria-hidden="true" />
          </span>
        }
        title={<Trans>Reverted</Trans>}
        amount={amountLabel}
        message={outcome.error}
        toAddress={toAddress}
        status={
          <span className="inline-flex items-center gap-1.5 text-destructive text-xs font-semibold">
            <span className="size-2 rounded-full bg-destructive" />
            <Trans>Reverted</Trans>
          </span>
        }
        onDone={goToWallet}
      />
    );
  }

  const txHash = outcome.otx.txHash || null;
  const explorerUrl = txHash ? `https://celoscan.io/tx/${txHash}` : null;
  const submittedAt = outcome.otx.createdAt ? formatSubmittedAt(outcome.otx.createdAt) : null;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <SuccessCheck />
        <h1 className="font-heading mt-3.5 text-[1.75rem] font-bold leading-tight">
          <Trans>Sent</Trans>
        </h1>
      </div>

      <div className="my-5 border border-border bg-card">
        {amountLabel ? (
          <ReceiptRow label={t`Amount`}>
            <SignedAmount direction="out" amount={amountLabel} />
          </ReceiptRow>
        ) : null}
        {toAddress ? (
          <ReceiptRow label={t`To`}>
            <EllipsizedAddress address={toAddress} />
          </ReceiptRow>
        ) : null}
        {txHash ? (
          <ReceiptRow label={t`Transaction`}>
            <CopyableMono value={txHash} label={t`Copy transaction hash`} onCopy={copy} />
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={t`Network`}>
          <span className="text-xs font-semibold">Celo</span>
        </ReceiptRow>
        {submittedAt ? (
          <ReceiptRow label={t`Submitted`}>
            <time className="font-mono text-xs font-semibold" dateTime={outcome.otx.createdAt}>
              {submittedAt}
            </time>
          </ReceiptRow>
        ) : null}
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Status</Trans>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <span className="size-2 rounded-full bg-primary" />
            <Trans>Confirmed</Trans>
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex gap-3">
        <Button className="h-11 flex-1" onClick={goToWallet}>
          {t`Done`}
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
  toAddress,
  status,
  onDone,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  amount: string | null;
  message: React.ReactNode;
  toAddress: string | null;
  status: React.ReactNode;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        {icon}
        <h1 className="font-heading mt-3.5 flex flex-col items-center gap-1 text-[1.75rem] font-bold leading-tight">
          <span>{title}</span>
          {amount ? <span className="text-primary">{amount}</span> : null}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
      </div>

      <div className="my-5 border border-border bg-card">
        {toAddress ? (
          <ReceiptRow label={<Trans>To</Trans>}>
            <EllipsizedAddress address={toAddress} />
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={<Trans>Network</Trans>}>
          <span className="text-xs font-semibold">Celo</span>
        </ReceiptRow>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Status</Trans>
          </span>
          {status}
        </div>
      </div>

      <div className="flex-1" />

      <Button className="h-11 w-full" onClick={onDone}>
        <Trans>Done</Trans>
      </Button>
    </div>
  );
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
