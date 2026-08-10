import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { RiCloseLine, RiFileCopyLine, RiTimeLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { EllipsizedAddress, SuccessCheck } from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import { useVoucherDeploymentContract } from "#/features/vouchers/hooks/use-voucher-deployment";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { exitVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";

export function VoucherDeploymentReceiptPage({ trackingId }: { trackingId?: string }) {
  const { t } = useLingui();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tracking = useOtxTracking(trackingId ?? null, { queryKey: "voucher-deploy-track" });
  const contractQuery = useVoucherDeploymentContract(
    trackingId ?? null,
    tracking.outcome.kind === "success",
  );
  const contract = contractQuery.data;
  const confirmed = contract?.status === "CONFIRMED" && contract.address !== null;

  useEffect(() => {
    if (!confirmed) return;
    void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
  }, [confirmed, queryClient]);

  const exit = (destination: string) => {
    exitVoucherCreateHistory({ history: router.history, destination });
  };

  if (!trackingId) {
    return (
      <DeploymentStateShell
        icon={<ErrorIcon />}
        title={t`Publishing unavailable`}
        message={t`Voucher tracking details are missing.`}
        status={<Status tone="error" label={t`Unavailable`} />}
        onDone={() => exit("/wallet/vouchers")}
      />
    );
  }

  if (tracking.outcome.kind === "error" || contractQuery.isError || contract?.status === "FAILED") {
    const message =
      tracking.outcome.kind === "error"
        ? tracking.outcome.error
        : contractQuery.error instanceof Error
          ? contractQuery.error.message
          : t`The voucher could not be published.`;
    return (
      <DeploymentStateShell
        icon={<ErrorIcon />}
        title={t`Publishing failed`}
        message={message}
        status={<Status tone="error" label={t`Failed`} />}
        onDone={() => exit("/wallet/vouchers")}
      />
    );
  }

  if (!confirmed || !contract.address) {
    return (
      <DeploymentStateShell
        icon={<PendingIcon />}
        title={t`Publishing your voucher...`}
        message={t`Waiting for blockchain confirmation...`}
        status={<Status tone="pending" label={t`Pending`} />}
        onDone={() => exit("/wallet/vouchers")}
      />
    );
  }

  const address = contract.address;
  const copyAddress = () => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy contract address`);
      return;
    }
    void navigator.clipboard
      .writeText(address)
      .then(() => toast.success(t`Contract address copied`))
      .catch(() => toast.error(t`Couldn't copy contract address`));
  };

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <SuccessCheck />
        <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>{contract.symbol} is live</Trans>
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>{contract.name} can be held, sent and redeemed.</Trans>
        </p>
        <div className="mt-3">
          <Status tone="success" label={t`Confirmed`} />
        </div>
      </div>

      <div className="mt-6 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <EllipsizedAddress address={address} className="min-w-0 flex-1" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="bg-card"
          aria-label={t`Copy contract address`}
          onClick={copyAddress}
        >
          <RiFileCopyLine className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <Button className="h-11 w-full" onClick={() => exit("/pools/")}>
          <Trans>Add to a pool</Trans>
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full bg-card"
          onClick={() => exit(`/vouchers/${address}?from=vouchers`)}
        >
          <Trans>View voucher</Trans>
        </Button>
      </div>
    </div>
  );
}

function DeploymentStateShell({
  icon,
  title,
  message,
  status,
  onDone,
}: {
  icon: React.ReactNode;
  title: string;
  message: React.ReactNode;
  status: React.ReactNode;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        {icon}
        <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
        <div className="mt-3">{status}</div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card px-4 py-1.5">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm font-medium">
            <Trans>Voucher contract</Trans>
          </span>
          <span className="text-muted-foreground text-xs">
            <Trans>In network</Trans>
          </span>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <Button variant="outline" className="h-11 w-full bg-card" onClick={onDone}>
          <Trans>Done</Trans>
        </Button>
      </div>
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
    <span className="flex size-14 items-center justify-center rounded-full border border-[oklch(0.74_0.16_80)]/40 bg-[oklch(0.74_0.16_80)]/10 text-[oklch(0.58_0.14_70)]">
      <RiTimeLine className="size-7" aria-hidden="true" />
    </span>
  );
}

function ErrorIcon() {
  return (
    <span className="flex size-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
      <RiCloseLine className="size-7" aria-hidden="true" />
    </span>
  );
}
