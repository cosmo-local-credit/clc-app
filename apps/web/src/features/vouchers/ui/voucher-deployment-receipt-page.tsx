import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { InfoRow } from "#/components/ui/info-row";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { useDeploymentContract } from "#/hooks/use-deployment";
import { exitVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { VoucherDetailsRows } from "./voucher-details-rows";

export function VoucherDeploymentReceiptPage({ trackingId }: { trackingId?: string }) {
  const { t } = useLingui();
  const router = useRouter();
  const queryClient = useQueryClient();
  const draft = useVoucherCreateDraft((state) => state.draft);
  const clearDraft = useVoucherCreateDraft((state) => state.clearDraft);
  const tracking = useOtxTracking(trackingId ?? null, { queryKey: "voucher-deploy-track" });
  const contractQuery = useDeploymentContract(
    trackingId ?? null,
    "TOKEN",
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
    clearDraft();
    exitVoucherCreateHistory({ history: router.history, destination });
  };

  if (!trackingId) {
    return (
      <DeploymentStateShell
        icon={<FailureCross />}
        title={t`Publishing unavailable`}
        message={t`Voucher tracking details are missing.`}
        status={<StatusPill tone="error" label={t`Unavailable`} />}
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
        icon={<FailureCross />}
        title={t`Publishing failed`}
        message={message}
        status={<StatusPill tone="error" label={t`Failed`} />}
      />
    );
  }

  if (!confirmed || !contract.address) {
    return (
      <DeploymentStateShell
        icon={<PendingClock />}
        title={t`Publishing your voucher...`}
        message={t`Waiting for blockchain confirmation...`}
        status={<StatusPill tone="pending" label={t`Pending`} />}
        showContractRow
      />
    );
  }

  const address = contract.address;
  const txHash = tracking.outcome.kind === "success" ? tracking.outcome.otx.txHash : "";
  const copyValue = (value: string, successMessage: string, errorMessage: string) => {
    if (!navigator.clipboard) {
      toast.error(errorMessage);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(successMessage))
      .catch(() => toast.error(errorMessage));
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
          <StatusPill tone="success" label={t`Published`} />
        </div>
      </div>

      <dl className="mt-6 border border-border bg-card">
        {draft ? (
          <VoucherDetailsRows values={draft} />
        ) : (
          <>
            <InfoRow label={t`Name`}>{contract.name}</InfoRow>
            <InfoRow label={t`Symbol`}>{contract.symbol}</InfoRow>
          </>
        )}
        <InfoRow label={t`Contract address`}>
          <CopyableInfoValue
            value={address}
            label={t`Copy contract address`}
            onCopy={(value) =>
              copyValue(value, t`Contract address copied`, t`Couldn't copy contract address`)
            }
          />
        </InfoRow>
        {txHash ? (
          <InfoRow label={t`Transaction hash`}>
            <CopyableInfoValue
              value={txHash}
              label={t`Copy transaction hash`}
              onCopy={(value) =>
                copyValue(value, t`Transaction hash copied`, t`Couldn't copy transaction hash`)
              }
            />
          </InfoRow>
        ) : null}
      </dl>

      <div className="mt-auto pt-6">
        <Button className="h-11 w-full" onClick={() => exit(`/vouchers/${address}?from=vouchers`)}>
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
  showContractRow = false,
}: {
  icon: React.ReactNode;
  title: string;
  message: React.ReactNode;
  status: React.ReactNode;
  /** Only meaningful while the deployment is in flight — a failed publish has no contract. */
  showContractRow?: boolean;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        {icon}
        <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
        <div className="mt-3">{status}</div>
      </div>

      {showContractRow ? (
        <div className="mt-6 border border-border bg-card px-4 py-1.5">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm font-medium">
              <Trans>Voucher contract</Trans>
            </span>
            <span className="text-muted-foreground text-xs">
              <Trans>In network</Trans>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
