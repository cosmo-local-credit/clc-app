import type { PoolDeploymentStage } from "@clc/core/features/pools/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiRefreshLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Spinner } from "#/components/ui/spinner";
import { FailureCross, StatusPill, SuccessCheck } from "#/components/wallet";
import { PoolSummaryDesk } from "#/desktop/pools/create/create-pool-parts";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskSection, DeskTitle } from "#/desktop/ui/page";
import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import { usePoolDeploymentReceipt } from "#/features/pools/hooks/use-pool-deployment-receipt";

export function PoolReceiptDesk({ trackingId }: { trackingId?: string }) {
  const { t } = useLingui();
  const {
    draft,
    stages,
    completedCount,
    contract,
    confirmed,
    failed,
    failureMessage,
    txHash,
    exit,
    copyValue,
  } = usePoolDeploymentReceipt(trackingId);

  if (!trackingId) {
    return (
      <ReceiptState
        icon={<FailureCross />}
        title={t`Publishing unavailable`}
        message={t`Pool tracking details are missing.`}
        status={<StatusPill tone="error" label={t`Unavailable`} />}
        summary={draft ? <PoolSummaryDesk values={draft} /> : null}
        actions={
          <Button variant="outline" onClick={() => exit("/pools/")}>
            <Trans>Back to pools</Trans>
          </Button>
        }
      />
    );
  }

  if (failed) {
    return (
      <ReceiptState
        icon={<FailureCross />}
        title={t`Publishing failed`}
        message={failureMessage}
        status={<StatusPill tone="error" label={t`Failed`} />}
        stages={stages}
        summary={draft ? <PoolSummaryDesk values={draft} /> : null}
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

  if (!confirmed || !contract?.address) {
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
        summary={draft ? <PoolSummaryDesk values={draft} /> : null}
      />
    );
  }

  const address = contract.address;

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
        draft ? (
          <PoolSummaryDesk
            values={draft}
            full
            onCopyFeeAddress={(value) =>
              copyValue(value, t`Fee recipient copied`, t`Couldn't copy fee recipient`)
            }
          />
        ) : (
          <DeskKV
            labelWidth="130px"
            rows={[
              [
                <Trans key="label">Pool</Trans>,
                <span key="value" dir="auto" className="font-sans">
                  {contract.name}
                </span>,
              ],
              [<Trans key="label">Symbol</Trans>, contract.symbol],
            ]}
          />
        )
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

const STAGE_STATE: Record<PoolDeploymentStage["state"], DeskStepState> = {
  done: "complete",
  active: "loading",
  failed: "failed",
  idle: "upcoming",
};

function StageList({ stages }: { stages: PoolDeploymentStage[] }) {
  const { t } = useLingui();
  return (
    <DeskStepper label={t`Publishing your pool…`}>
      {stages.map((stage, index) => (
        <DeskStep
          key={stage.label}
          index={index + 1}
          label={stage.label}
          state={STAGE_STATE[stage.state]}
          description={
            stage.state === "failed" ? (
              <span className="text-destructive">{stage.status}</span>
            ) : (
              stage.status
            )
          }
        />
      ))}
    </DeskStepper>
  );
}
