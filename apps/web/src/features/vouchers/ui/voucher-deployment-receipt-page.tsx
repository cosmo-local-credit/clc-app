import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Field } from "#/components/ui/field";
import { InfoRow } from "#/components/ui/info-row";
import { Input } from "#/components/ui/input";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { useVoucherDeploymentReceipt } from "#/features/vouchers/hooks/use-voucher-deployment-receipt";

export function VoucherDeploymentReceiptPage({
  trackingId,
  mintTrackingId,
  mintAmount,
}: {
  trackingId?: string;
  mintTrackingId?: string;
  mintAmount?: string;
}) {
  const { t } = useLingui();
  const receipt = useVoucherDeploymentReceipt({ trackingId, mintTrackingId, mintAmount });
  const {
    contract,
    draft,
    decimals,
    supply,
    supplyError,
    supplyValue,
    copyValue,
    mintError,
    mintFailed,
    minting,
    trackingUnavailable,
    supplyChecking,
    supplyCheckFailed,
    ownerUnavailable,
    ownerMismatch,
    blockingMessage,
    pendingState,
  } = receipt;

  if (receipt.phase === "missing") {
    return (
      <DeploymentStateShell
        icon={<FailureCross />}
        title={t`Publishing unavailable`}
        message={t`Voucher tracking details are missing.`}
        status={<StatusPill tone="error" label={t`Unavailable`} />}
      />
    );
  }

  if (receipt.phase === "failed") {
    return (
      <DeploymentStateShell
        icon={<FailureCross />}
        title={t`Publishing failed`}
        message={receipt.failureMessage}
        status={<StatusPill tone="error" label={t`Failed`} />}
      />
    );
  }

  if (receipt.phase === "deploying" || !contract?.address) {
    return (
      <DeploymentStateShell
        icon={<PendingClock />}
        title={t`Publishing your voucher…`}
        message={t`Waiting for blockchain confirmation…`}
        status={<StatusPill tone="pending" label={t`Pending`} />}
        showContractRow
      />
    );
  }

  const address = contract.address;
  const detailRows = (
    <>
      <InfoRow label={t`Name`}>{contract.name}</InfoRow>
      <InfoRow label={t`Symbol`}>{contract.symbol}</InfoRow>
      {draft ? (
        <InfoRow label={t`Type`} muted>
          {draft.voucherType === "expiring" ? t`Expiring` : t`Standard`}
        </InfoRow>
      ) : null}
      {decimals !== null ? (
        <InfoRow label={t`Decimals`} muted>
          {decimals}
        </InfoRow>
      ) : null}
      <InfoRow label={t`Contract address`}>
        <CopyableInfoValue
          value={address}
          label={t`Copy contract address`}
          onCopy={(value) =>
            copyValue(value, t`Contract address copied`, t`Couldn't copy contract address`)
          }
        />
      </InfoRow>
    </>
  );

  if (receipt.phase === "supply") {
    return (
      <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center text-center">
          {mintFailed || supplyCheckFailed ? (
            <FailureCross />
          ) : pendingState ? (
            <PendingClock />
          ) : (
            <SuccessCheck />
          )}
          <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">
            {mintFailed ? (
              <Trans>Creation failed</Trans>
            ) : trackingUnavailable ? (
              <Trans>Checking creation status</Trans>
            ) : supplyCheckFailed ? (
              <Trans>Supply check unavailable</Trans>
            ) : minting ? (
              <Trans>Creating {contract.symbol}…</Trans>
            ) : (
              <Trans>{contract.name} is deployed</Trans>
            )}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {mintError ??
              blockingMessage ??
              (supplyCheckFailed
                ? t`We couldn't verify whether this voucher already has supply.`
                : t`Create the first supply to finish publishing this voucher.`)}
          </p>
          <div className="mt-3">
            <StatusPill
              tone={
                mintFailed || supplyCheckFailed ? "error" : pendingState ? "pending" : "success"
              }
              label={
                mintFailed
                  ? t`Failed`
                  : pendingState
                    ? t`Pending`
                    : supplyCheckFailed
                      ? t`Unavailable`
                      : t`Deployed`
              }
            />
          </div>
        </div>

        {mintAmount ? (
          // The amount was chosen while creating the voucher; asking again here
          // would be the same question twice. The input below is the recovery
          // path for a receipt opened without it.
          <dl className="mt-6 border border-border bg-card">
            <InfoRow label={t`Supply`}>
              {supplyValue
                ? `${supplyValue.value} ${supplyValue.unit}`
                : `${supply} ${contract.symbol}`}
            </InfoRow>
          </dl>
        ) : (
          <div className="mt-6">
            <Field label={t`Create vouchers`} htmlFor="voucher-supply" error={supplyError}>
              <Input
                id="voucher-supply"
                dir="ltr"
                inputMode="decimal"
                value={supply}
                onChange={(event) => receipt.setSupply(event.target.value)}
                placeholder="0"
                disabled={
                  minting ||
                  supplyChecking ||
                  supplyCheckFailed ||
                  trackingUnavailable ||
                  ownerUnavailable ||
                  ownerMismatch ||
                  receipt.walletPreparing
                }
                aria-invalid={supplyError !== null}
              />
            </Field>
            {supplyValue ? (
              <p className="mt-1 font-mono text-muted-foreground text-xs tabular-nums">
                <Trans>
                  Value: {supplyValue.value} {supplyValue.unit}
                </Trans>
              </p>
            ) : null}
          </div>
        )}

        <AdvancedDeploymentDetails className="mt-3.5">{detailRows}</AdvancedDeploymentDetails>

        <div className="mt-auto pt-6">
          <Button
            tap
            className="w-full"
            disabled={ownerUnavailable || ownerMismatch || !receipt.walletAddress}
            pending={minting || receipt.mintPending || supplyChecking || receipt.walletPreparing}
            onClick={receipt.primaryAction}
          >
            {trackingUnavailable ? (
              <Trans>Check creation status</Trans>
            ) : supplyCheckFailed ? (
              <Trans>Check supply again</Trans>
            ) : minting ? (
              <Trans>Creating…</Trans>
            ) : supplyChecking ? (
              <Trans>Checking supply…</Trans>
            ) : receipt.walletPreparing ? (
              <Trans>Preparing wallet…</Trans>
            ) : mintFailed ? (
              <Trans>Try again</Trans>
            ) : (
              <Trans>Create supply</Trans>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const { publishedSupply, publishedSupplyValue, deploymentTxHash, mintTxHash } = receipt;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <SuccessCheck />
        <h1 className="mt-3.5 font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>{contract.name} is live</Trans>
        </h1>
        <div className="mt-3">
          <StatusPill tone="success" label={t`Published`} />
        </div>
      </div>

      {publishedSupply ? (
        <dl className="mt-6 border border-border bg-card">
          <InfoRow label={t`Supply`}>
            {publishedSupplyValue
              ? `${publishedSupplyValue.value} ${publishedSupplyValue.unit}`
              : `${publishedSupply} ${contract.symbol}`}
          </InfoRow>
        </dl>
      ) : null}

      <AdvancedDeploymentDetails className={publishedSupply ? "mt-3.5" : "mt-6"}>
        {detailRows}
        {deploymentTxHash ? (
          <InfoRow label={t`Deployment transaction`}>
            <CopyableInfoValue
              value={deploymentTxHash}
              label={t`Copy deployment transaction hash`}
              onCopy={(value) =>
                copyValue(
                  value,
                  t`Deployment transaction hash copied`,
                  t`Couldn't copy deployment transaction hash`,
                )
              }
            />
          </InfoRow>
        ) : null}
        {mintTxHash ? (
          <InfoRow label={t`Supply creation transaction`}>
            <CopyableInfoValue
              value={mintTxHash}
              label={t`Copy supply creation transaction hash`}
              onCopy={(value) =>
                copyValue(
                  value,
                  t`Supply creation transaction hash copied`,
                  t`Couldn't copy supply creation transaction hash`,
                )
              }
            />
          </InfoRow>
        ) : null}
      </AdvancedDeploymentDetails>

      <div className="mt-auto pt-6">
        <Button
          tap
          className="w-full"
          onClick={() => receipt.exit(`/vouchers/${address}?from=vouchers`)}
        >
          <Trans>View voucher</Trans>
        </Button>
      </div>
    </div>
  );
}

function AdvancedDeploymentDetails({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <details className={`${className} border border-border bg-card`}>
      <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold text-sm">
        <Trans>Advanced details</Trans>
      </summary>
      <dl className="border-border border-t">{children}</dl>
    </details>
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
