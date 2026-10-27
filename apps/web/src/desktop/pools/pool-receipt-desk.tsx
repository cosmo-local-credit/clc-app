import {
  getPoolDeploymentRecords,
  getPoolTrackingOutcome,
} from "@clc/api/features/pools/deploy-client";
import { poolKeys } from "@clc/api/features/pools/queries";
import {
  getPoolDeploymentStages,
  type PoolCreateInput,
  type PoolDeploymentStage,
  type PoolDeploymentStageState,
} from "@clc/core/features/pools/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { RiCheckLine, RiCloseLine, RiRefreshLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { InfoRow } from "#/components/ui/info-row";
import { Spinner } from "#/components/ui/spinner";
import { EllipsizedAddress, FailureCross, StatusPill, SuccessCheck } from "#/components/wallet";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskSection, DeskTitle } from "#/desktop/ui/page";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { PoolDetailsRows } from "#/features/pools/ui/pool-details-rows";
import { useDeploymentContract } from "#/hooks/use-deployment";
import { exitPoolCreateHistory } from "#/lib/navigation/pool-create-history";
import { cn } from "#/lib/utils";

export function PoolReceiptDesk({ trackingId }: { trackingId?: string }) {
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
      <ReceiptState
        icon={<FailureCross />}
        title={t`Publishing unavailable`}
        message={t`Pool tracking details are missing.`}
        status={<StatusPill tone="error" label={t`Unavailable`} />}
        summary={draft ? <DraftSummary draft={draft} /> : null}
        actions={
          <Button variant="outline" onClick={() => exit("/pools/")}>
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
      <ReceiptState
        icon={<FailureCross />}
        title={t`Publishing failed`}
        message={message}
        status={<StatusPill tone="error" label={t`Failed`} />}
        stages={stages}
        summary={draft ? <DraftSummary draft={draft} /> : null}
        actions={
          <>
            <Button onClick={() => exit("/pools/create/review", true)}>
              <RiRefreshLine aria-hidden="true" />
              <Trans>Try again</Trans>
            </Button>
            <Button variant="outline" onClick={() => exit("/pools/")}>
              <Trans>Back to pools</Trans>
            </Button>
          </>
        }
      />
    );
  }

  if (!confirmed || !contract.address) {
    return (
      <ReceiptState
        icon={
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Spinner className="size-6" />
          </span>
        }
        title={t`Publishing your pool…`}
        message={
          <span role="status">
            {t`${completedCount} of ${stages.length}`} · {t`Waiting for blockchain confirmation…`}
          </span>
        }
        stages={stages}
        summary={draft ? <DraftSummary draft={draft} /> : null}
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
    <ReceiptLayout
      header={
        <ReceiptHeader
          icon={<SuccessCheck />}
          title={<Trans>{contract.symbol} is live</Trans>}
          message={<StatusPill tone="success" label={t`Published`} />}
        />
      }
      main={
        <>
          <DeskKV
            labelWidth="140px"
            rows={[
              [
                <Trans key="label">Contract address</Trans>,
                <CopyableInfoValue
                  key="value"
                  value={address}
                  label={t`Copy contract address`}
                  onCopy={(value) =>
                    copyValue(value, t`Contract address copied`, t`Couldn't copy contract address`)
                  }
                />,
              ],
              txHash
                ? [
                    <Trans key="label">Transaction hash</Trans>,
                    <CopyableInfoValue
                      key="value"
                      value={txHash}
                      label={t`Copy transaction hash`}
                      onCopy={(value) =>
                        copyValue(
                          value,
                          t`Transaction hash copied`,
                          t`Couldn't copy transaction hash`,
                        )
                      }
                    />,
                  ]
                : null,
            ]}
          />
          <div>
            <Button onClick={() => exit(`/pools/${address}`)}>
              <Trans>View pool</Trans>
            </Button>
          </div>
        </>
      }
      summary={
        <dl className="border border-border bg-card">
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
        </dl>
      }
    />
  );
}

function ReceiptState({
  icon,
  title,
  message,
  status,
  stages,
  summary,
  actions,
}: {
  icon: ReactNode;
  title: string;
  message: ReactNode;
  status?: ReactNode;
  stages?: PoolDeploymentStage[];
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <ReceiptLayout
      header={<ReceiptHeader icon={icon} title={title} message={message} status={status} />}
      main={
        <>
          {stages ? (
            <div className="border border-border bg-card p-4">
              <StageList stages={stages} />
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </>
      }
      summary={summary}
    />
  );
}

/** The publish screen: stages in the main column, what was sent in the side column. */
function ReceiptLayout({
  header,
  main,
  summary,
}: {
  header: ReactNode;
  main: ReactNode;
  summary?: ReactNode;
}) {
  return (
    <div className="grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-8 pt-7 pb-10">
      <div className="grid min-w-0 content-start gap-5">
        {header}
        {main}
      </div>
      {summary ? (
        <DeskSection title={<Trans>Summary</Trans>} className="sticky top-7">
          {summary}
        </DeskSection>
      ) : null}
    </div>
  );
}

function ReceiptHeader({
  icon,
  title,
  message,
  status,
}: {
  icon: ReactNode;
  title: ReactNode;
  message: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      {icon}
      <div className="grid min-w-0 gap-1">
        <DeskTitle>{title}</DeskTitle>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {message}
          {status}
        </div>
      </div>
    </div>
  );
}

/** The summary from the review step, kept beside the stages while they confirm. */
function DraftSummary({ draft }: { draft: PoolCreateInput }) {
  const { t } = useLingui();
  const pricing =
    draft.pricing === "relative"
      ? t`Relative pricing`
      : draft.pricing === "oracle"
        ? t`Oracle pricing`
        : t`Equal value`;
  const feeAddress = draft.feeAddress.trim();
  return (
    <DeskKV
      rows={[
        [
          <Trans key="label">Pool</Trans>,
          <span key="value" dir="auto" className="font-sans">
            {draft.name}
          </span>,
        ],
        [<Trans key="label">Symbol</Trans>, draft.symbol],
        [<Trans key="label">Unit of account</Trans>, draft.unitOfAccount],
        [
          <Trans key="label">Pricing</Trans>,
          <span key="value" className="font-sans">
            {pricing}
          </span>,
        ],
        [<Trans key="label">Swap fee</Trans>, `${draft.feePolicyDefault}%`],
        Number(draft.feePolicyDefault) > 0
          ? [
              <Trans key="label">Fee recipient</Trans>,
              feeAddress === "" ? (
                <span key="value" className="font-sans">
                  {t`Your wallet`}
                </span>
              ) : (
                <EllipsizedAddress key="value" address={feeAddress} />
              ),
            ]
          : null,
        draft.location?.locationName
          ? [
              <Trans key="label">Location</Trans>,
              <span key="value" dir="auto" className="font-sans">
                {draft.location.locationName}
              </span>,
            ]
          : null,
      ]}
    />
  );
}

function StageList({ stages }: { stages: PoolDeploymentStage[] }) {
  return (
    <ol className="grid">
      {stages.map((stage, index) => {
        const last = index === stages.length - 1;
        return (
          <li
            key={stage.label}
            className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3"
            aria-current={stage.state === "active" ? "step" : undefined}
          >
            <StageMark state={stage.state} index={index + 1} />
            <div className="min-w-0">
              <div
                className={cn(
                  "text-sm leading-6 font-semibold",
                  stage.state === "idle" && "font-medium text-muted-foreground",
                )}
              >
                {stage.label}
              </div>
              <div
                className={cn(
                  "text-xs",
                  stage.state === "failed" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {stage.status}
              </div>
            </div>
            {last ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-auto my-1 block min-h-6 w-0.5",
                  stage.state === "done" ? "bg-primary" : "bg-foreground/15",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StageMark({ state, index }: { state: PoolDeploymentStageState; index: number }) {
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-full font-mono text-2xs font-semibold",
        state === "done" && "bg-primary text-primary-foreground",
        state === "failed" && "bg-destructive text-white",
        state === "active" &&
          "bg-card text-foreground shadow-[inset_0_0_0_2px_var(--color-primary)]",
        state === "idle" &&
          "bg-card text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_18%,transparent)]",
      )}
    >
      {state === "done" ? <RiCheckLine className="size-3" aria-hidden="true" /> : null}
      {state === "failed" ? <RiCloseLine className="size-3" aria-hidden="true" /> : null}
      {state === "active" ? <Spinner className="size-3.5" /> : null}
      {state === "idle" ? index : null}
    </span>
  );
}
