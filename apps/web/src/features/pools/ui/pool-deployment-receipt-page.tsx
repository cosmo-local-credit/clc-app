import {
  getPoolDeploymentStages,
  type PoolDeploymentStage,
  type PoolDeploymentStageState,
} from "@clc/core/features/pools/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { RiCheckLine, RiCloseLine, RiRefreshLine, RiTimeLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { InfoRow } from "#/components/ui/info-row";
import { StepProgress } from "#/components/ui/step-progress";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import {
  getPoolDeploymentRecords,
  getPoolTrackingOutcome,
} from "@clc/api/features/pools/deploy-client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useDeploymentContract } from "#/hooks/use-deployment";
import { exitPoolCreateHistory } from "#/lib/navigation/pool-create-history";
import { PoolDetailsRows } from "./pool-details-rows";

export function PoolDeploymentReceiptPage({ trackingId }: { trackingId?: string }) {
  const { t } = useLingui();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearDraft = usePoolCreateDraft((state) => state.clearDraft);
  const draft = usePoolCreateDraft((state) => state.draft);
  const draftPricing = draft?.pricing;
  const tracking = useOtxTracking(trackingId ?? null, {
    queryKey: "pool-deploy-track",
    getOutcome: getPoolTrackingOutcome,
  });
  const records = getPoolDeploymentRecords(tracking.data);
  const stages = getPoolDeploymentStages(
    records,
    {
      registry: t`Voucher registry`,
      limits: t`Limits`,
      feePolicy: t`Fee policy`,
      pricing: t`Pricing`,
      pool: t`The pool`,
    },
    {
      confirmed: t`Confirmed`,
      inNetwork: t`In network`,
      failed: t`Failed`,
      reverted: t`Reverted`,
      queued: t`Queued`,
      notSent: t`Not sent`,
    },
    draftPricing,
  );
  const completedCount = stages.filter((stage) => stage.state === "done").length;
  const failedStage = stages.find((stage) => stage.state === "failed");
  const contractQuery = useDeploymentContract(
    trackingId ?? null,
    "POOL",
    tracking.outcome.kind === "success",
  );
  const contract = contractQuery.data;
  const confirmed = contract?.status === "CONFIRMED" && contract.address !== null;

  useEffect(() => {
    if (!confirmed) return;
    void queryClient.invalidateQueries({ queryKey: poolKeys.all });
  }, [confirmed, queryClient]);

  const exit = (destination: string, preserveDraft = false) => {
    if (!preserveDraft) clearDraft();
    exitPoolCreateHistory({ history: router.history, destination });
  };

  if (!trackingId) {
    return (
      <DeploymentStateShell
        icon={<FailureCross />}
        title={t`Publishing unavailable`}
        message={t`Pool tracking details are missing.`}
        status={<StatusPill tone="error" label={t`Unavailable`} />}
        actions={
          <Button variant="outline" className="h-11 w-full bg-card" onClick={() => exit("/pools/")}>
            <Trans>Back to pools</Trans>
          </Button>
        }
      />
    );
  }

  if (tracking.outcome.kind === "error" || contractQuery.isError || contract?.status === "FAILED") {
    const message = failedStage
      ? t`${failedStage.label} failed on-chain. The pool was not created.`
      : tracking.outcome.kind === "error"
        ? tracking.outcome.error
        : contractQuery.error instanceof Error
          ? contractQuery.error.message
          : t`The pool could not be published.`;
    return (
      <DeploymentStateShell
        icon={<FailureCross />}
        title={t`Publishing failed`}
        message={message}
        status={<StatusPill tone="error" label={t`Failed`} />}
        stages={stages}
        actions={
          <>
            <Button className="h-11 w-full" onClick={() => exit("/pools/create/review", true)}>
              <RiRefreshLine className="size-4" aria-hidden="true" />
              <Trans>Try again</Trans>
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full bg-card"
              onClick={() => exit("/pools/")}
            >
              <Trans>Back to pools</Trans>
            </Button>
          </>
        }
      />
    );
  }

  if (!confirmed || !contract.address) {
    return (
      <DeploymentStateShell
        icon={<PendingClock />}
        title={t`Publishing your pool...`}
        message={t`Waiting for blockchain confirmation...`}
        status={<StatusPill tone="pending" label={t`Pending`} />}
        stages={stages}
        progress={{
          completed: completedCount,
          total: stages.length,
          label: t`${completedCount} of ${stages.length}`,
          ariaLabel: t`${completedCount} of ${stages.length} confirmed`,
        }}
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
          <Trans>{contract.name} is ready for vouchers and swaps.</Trans>
        </p>
        <div className="mt-3">
          <StatusPill tone="success" label={t`Published`} />
        </div>
      </div>

      <dl className="mt-6 border border-border bg-card">
        {draft ? (
          <PoolDetailsRows
            values={draft}
            onCopyFeeAddress={(value) =>
              copyValue(value, t`Fee recipient copied`, t`Couldn't copy fee recipient`)
            }
          />
        ) : (
          <>
            <InfoRow label={t`Pool`}>{contract.name}</InfoRow>
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
        <Button className="h-11 w-full" onClick={() => exit(`/pools/${address}`)}>
          <Trans>View pool</Trans>
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
  stages,
  progress,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  message: React.ReactNode;
  status: React.ReactNode;
  stages?: PoolDeploymentStage[];
  progress?: { completed: number; total: number; label: string; ariaLabel: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        {icon}
        <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
        <div className="mt-3">{status}</div>
      </div>

      {progress ? (
        <StepProgress
          step={progress.completed}
          total={progress.total}
          label={progress.label}
          ariaLabel={progress.ariaLabel}
          className="mt-5"
        />
      ) : null}

      {stages ? (
        <DeploymentChecklist stages={stages} className={progress ? "mt-3" : "mt-5"} />
      ) : null}

      {actions ? <div className="mt-auto space-y-3 pt-6">{actions}</div> : null}
    </div>
  );
}

function DeploymentChecklist({
  stages,
  className,
}: {
  stages: PoolDeploymentStage[];
  className: string;
}) {
  return (
    <ul className={`border border-border bg-card px-4 py-1.5 ${className}`}>
      {stages.map((stage, index) => (
        <li
          key={stage.label}
          className={`grid min-h-11 grid-cols-[1.125rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-sm ${index === stages.length - 1 ? "" : "border-b border-border"}`}
        >
          <StageMark state={stage.state} />
          <span className={stage.state === "idle" ? "text-muted-foreground" : ""}>
            {stage.label}
          </span>
          <span
            className={`font-mono text-[10px] uppercase tracking-wide ${
              stage.state === "failed" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {stage.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StageMark({ state }: { state: PoolDeploymentStageState }) {
  const className =
    state === "done"
      ? "border-primary bg-primary text-primary-foreground"
      : state === "failed"
        ? "border-destructive bg-destructive text-destructive-foreground"
        : state === "active"
          ? "border-primary border-dashed text-primary"
          : "border-border bg-card text-muted-foreground";
  return (
    <span className={`grid size-[1.125rem] place-items-center rounded-none border ${className}`}>
      {state === "done" ? <RiCheckLine className="size-3" aria-hidden="true" /> : null}
      {state === "failed" ? <RiCloseLine className="size-3" aria-hidden="true" /> : null}
      {state === "active" ? <RiTimeLine className="size-3" aria-hidden="true" /> : null}
    </span>
  );
}
