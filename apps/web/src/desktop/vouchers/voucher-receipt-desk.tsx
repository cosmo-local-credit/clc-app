import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiArrowDownSLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import { FailureCross, PendingClock, SuccessCheck } from "#/components/wallet";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskEyebrow, DeskTitle } from "#/desktop/ui/page";
import { DeskStep, DeskStepper, type DeskStepState } from "#/desktop/ui/stepper";
import { useVoucherDeploymentReceipt } from "#/features/vouchers/hooks/use-voucher-deployment-receipt";
import { cn } from "#/lib/utils";

type Receipt = ReturnType<typeof useVoucherDeploymentReceipt>;

/**
 * `/vouchers/create/receipt` on desktop: the receipt and its two on-chain
 * stages (the contract, then its first supply) on the left, the voucher as
 * the Market will show it on the right. Every state comes from the phone
 * receipt's hook.
 */
export function VoucherReceiptDesk({
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
  const { contract, draft, phase } = receipt;
  const name = contract?.name ?? draft?.name ?? null;
  const symbol = contract?.symbol ?? draft?.symbol ?? null;
  const preview =
    name && symbol ? (
      <VoucherPreview
        name={name}
        symbol={symbol}
        seed={contract?.address ?? symbol}
        tags={draft?.tags ?? receipt.voucherDetail?.tags ?? []}
        description={draft?.description ?? receipt.voucherDetail?.description ?? null}
      />
    ) : null;

  if (phase === "missing") {
    return (
      <ReceiptLayout preview={preview}>
        <ReceiptHeader
          icon={<FailureCross />}
          title={t`Publishing unavailable`}
          status={<StatusBadge tone="error">{t`Unavailable`}</StatusBadge>}
          message={t`Voucher tracking details are missing.`}
        />
      </ReceiptLayout>
    );
  }

  if (phase === "failed") {
    return (
      <ReceiptLayout preview={preview}>
        <ReceiptHeader
          icon={<FailureCross />}
          title={t`Publishing failed`}
          status={<StatusBadge tone="error">{t`Failed`}</StatusBadge>}
          message={receipt.failureMessage}
        />
        <StagePanel receipt={receipt} />
      </ReceiptLayout>
    );
  }

  if (phase === "deploying" || !contract?.address) {
    return (
      <ReceiptLayout preview={preview}>
        <ReceiptHeader
          icon={<PendingClock />}
          title={t`Publishing your voucher…`}
          status={<StatusBadge tone="pending">{t`Pending`}</StatusBadge>}
          message={<span role="status">{t`Waiting for blockchain confirmation…`}</span>}
        />
        <StagePanel receipt={receipt} />
      </ReceiptLayout>
    );
  }

  const address = contract.address;
  const { copyValue } = receipt;
  const detailRows: readonly (readonly [ReactNode, ReactNode] | null)[] = [
    [t`Name`, <Prose key="name">{contract.name}</Prose>],
    [t`Symbol`, contract.symbol],
    draft ? [t`Type`, <Prose key="type">{t`Standard`}</Prose>] : null,
    receipt.decimals !== null ? [t`Decimals`, String(receipt.decimals)] : null,
    [
      t`Contract address`,
      <CopyableInfoValue
        key="address"
        value={address}
        label={t`Copy contract address`}
        onCopy={(value) =>
          copyValue(value, t`Contract address copied`, t`Couldn't copy contract address`)
        }
      />,
    ],
  ];

  if (phase === "supply") {
    const {
      mintError,
      mintFailed,
      minting,
      trackingUnavailable,
      supplyChecking,
      supplyCheckFailed,
      ownerUnavailable,
      ownerMismatch,
      pendingState,
      supplyValue,
    } = receipt;
    return (
      <ReceiptLayout preview={preview}>
        <ReceiptHeader
          icon={
            mintFailed || supplyCheckFailed ? (
              <FailureCross />
            ) : pendingState ? (
              <PendingClock />
            ) : (
              <SuccessCheck />
            )
          }
          title={
            mintFailed ? (
              <Trans>Creation failed</Trans>
            ) : trackingUnavailable ? (
              <Trans>Checking creation status</Trans>
            ) : supplyCheckFailed ? (
              <Trans>Supply check unavailable</Trans>
            ) : minting ? (
              <Trans>Creating {contract.symbol}…</Trans>
            ) : (
              <Trans>{contract.name} is deployed</Trans>
            )
          }
          status={
            <StatusBadge
              tone={
                mintFailed || supplyCheckFailed ? "error" : pendingState ? "pending" : "success"
              }
            >
              {mintFailed
                ? t`Failed`
                : pendingState
                  ? t`Pending`
                  : supplyCheckFailed
                    ? t`Unavailable`
                    : t`Deployed`}
            </StatusBadge>
          }
          message={
            mintError ??
            receipt.blockingMessage ??
            (supplyCheckFailed
              ? t`We couldn't verify whether this voucher already has supply.`
              : t`Create the first supply to finish publishing this voucher.`)
          }
        />
        <StagePanel receipt={receipt} />
        {mintAmount ? (
          <DeskKV
            labelWidth="110px"
            rows={[
              [
                t`Supply`,
                supplyValue
                  ? `${supplyValue.value} ${supplyValue.unit}`
                  : `${receipt.supply} ${contract.symbol}`,
              ],
            ]}
          />
        ) : (
          <div className="grid max-w-80 gap-1">
            <Field
              label={t`Create vouchers`}
              htmlFor="desk-voucher-supply"
              error={receipt.supplyError}
            >
              <Input
                id="desk-voucher-supply"
                dir="ltr"
                inputMode="decimal"
                className="font-mono"
                value={receipt.supply}
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
                aria-invalid={receipt.supplyError !== null}
              />
            </Field>
            {supplyValue ? (
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                <Trans>
                  Value: {supplyValue.value} {supplyValue.unit}
                </Trans>
              </p>
            ) : null}
          </div>
        )}
        <AdvancedDetails rows={detailRows} />
        <div className="flex">
          <Button
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
      </ReceiptLayout>
    );
  }

  const { publishedSupply, publishedSupplyValue, deploymentTxHash, mintTxHash } = receipt;
  return (
    <ReceiptLayout preview={preview}>
      <ReceiptHeader
        icon={<SuccessCheck />}
        title={<Trans>{contract.name} is live</Trans>}
        status={<StatusBadge tone="success">{t`Published`}</StatusBadge>}
      />
      {publishedSupply || deploymentTxHash || mintTxHash ? (
        <DeskKV
          labelWidth="110px"
          rows={[
            publishedSupply
              ? [
                  t`Supply`,
                  publishedSupplyValue
                    ? `${publishedSupplyValue.value} ${publishedSupplyValue.unit}`
                    : `${publishedSupply} ${contract.symbol}`,
                ]
              : null,
            deploymentTxHash
              ? [
                  <Trans key="label">Deployment</Trans>,
                  <CopyableInfoValue
                    key="value"
                    value={deploymentTxHash}
                    label={t`Copy deployment transaction hash`}
                    onCopy={(value) =>
                      copyValue(
                        value,
                        t`Deployment transaction hash copied`,
                        t`Couldn't copy deployment transaction hash`,
                      )
                    }
                  />,
                ]
              : null,
            mintTxHash
              ? [
                  <Trans key="label">Supply creation</Trans>,
                  <CopyableInfoValue
                    key="value"
                    value={mintTxHash}
                    label={t`Copy supply creation transaction hash`}
                    onCopy={(value) =>
                      copyValue(
                        value,
                        t`Supply creation transaction hash copied`,
                        t`Couldn't copy supply creation transaction hash`,
                      )
                    }
                  />,
                ]
              : null,
          ]}
        />
      ) : null}
      <AdvancedDetails rows={detailRows} />
      <div className="flex">
        <Button onClick={() => receipt.exit(`/vouchers/${address}?from=vouchers`)}>
          <Trans>View voucher</Trans>
        </Button>
      </div>
    </ReceiptLayout>
  );
}

/** Prose in a mono KV cell: sans, and allowed to wrap. */
function Prose({ children }: { children: ReactNode }) {
  return (
    <span dir="auto" className="block font-sans font-normal whitespace-normal break-words">
      {children}
    </span>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "pending" | "error";
  children: ReactNode;
}) {
  return (
    <Badge
      size="sm"
      caps
      variant={tone === "success" ? "primary" : tone === "pending" ? "muted" : "outline"}
      className={cn(tone === "error" && "border-destructive/40 text-destructive")}
    >
      {children}
    </Badge>
  );
}

/**
 * The two transactions behind a voucher, as the pool receipt draws its five:
 * the contract, then its first supply, each with its status under it.
 */
function StagePanel({ receipt }: { receipt: Receipt }) {
  const { t } = useLingui();
  const { phase } = receipt;
  const contractState: DeskStepState =
    phase === "failed" ? "failed" : phase === "deploying" ? "loading" : "complete";
  const contractStatus =
    phase === "failed" ? (
      <span className="text-destructive">{t`Failed`}</span>
    ) : phase === "deploying" ? (
      t`In network`
    ) : (
      t`Confirmed`
    );

  let supplyState: DeskStepState = "upcoming";
  let supplyStatus: ReactNode = phase === "deploying" ? t`Queued` : undefined;
  if (phase === "supply") {
    if (receipt.mintFailed) {
      supplyState = "failed";
      supplyStatus = <span className="text-destructive">{t`Failed`}</span>;
    } else if (receipt.supplyCheckFailed) {
      supplyState = "failed";
      supplyStatus = <span className="text-destructive">{t`Unavailable`}</span>;
    } else if (receipt.minting) {
      supplyState = "loading";
      supplyStatus = t`In network`;
    } else if (receipt.trackingUnavailable) {
      supplyState = "loading";
      supplyStatus = t`Checking creation status`;
    } else if (receipt.supplyChecking) {
      supplyState = "loading";
      supplyStatus = t`Checking supply…`;
    } else {
      supplyState = "current";
      supplyStatus = t`Pending`;
    }
  }

  return (
    <div className="border border-border bg-card p-4">
      <DeskStepper label={t`Publishing your voucher…`}>
        <DeskStep
          index={1}
          label={<Trans>Voucher contract</Trans>}
          state={contractState}
          description={contractStatus}
        />
        <DeskStep
          index={2}
          label={<Trans>Supply</Trans>}
          state={supplyState}
          description={supplyStatus}
        />
      </DeskStepper>
    </div>
  );
}

function AdvancedDetails({ rows }: { rows: readonly (readonly [ReactNode, ReactNode] | null)[] }) {
  return (
    <details className="group border-border border-y">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Trans>Advanced details</Trans>
        <RiArrowDownSLine
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <DeskKV labelWidth="140px" rows={rows} className="mb-4" />
    </details>
  );
}

/** `.page.detail` at 1100px: the receipt, and the voucher as the Market will show it. */
function ReceiptLayout({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  return (
    <div className="grid w-full max-w-[1164px] grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-8 pt-7 pb-10">
      <div className="grid min-w-0 content-start gap-5">{children}</div>
      {preview ? (
        <div className="sticky top-7 grid min-w-0 content-start gap-2.5">{preview}</div>
      ) : null}
    </div>
  );
}

function ReceiptHeader({
  icon,
  title,
  status,
  message,
}: {
  icon: ReactNode;
  title: ReactNode;
  status: ReactNode;
  message?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <span className="shrink-0">{icon}</span>
      <div className="grid min-w-0 justify-items-start gap-1">
        <DeskTitle>
          <span className="[overflow-wrap:anywhere]">{title}</span>
        </DeskTitle>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {status}
          {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        </div>
      </div>
    </div>
  );
}

function VoucherPreview({
  name,
  symbol,
  seed,
  tags,
  description,
}: {
  name: string;
  symbol: string;
  seed: string;
  tags: readonly string[];
  description: string | null;
}) {
  const hue = hueFromSeed(seed.toLowerCase());
  return (
    <>
      <DeskEyebrow>
        <Trans>Preview · Market</Trans>
      </DeskEyebrow>
      <div className="border border-border bg-card">
        <div
          className="h-24"
          aria-hidden="true"
          style={{
            background: `linear-gradient(135deg, color-mix(in oklch, ${hue} 70%, #000), ${hue})`,
          }}
        />
        <div className="grid gap-1.5 p-4">
          <p dir="auto" className="truncate font-heading text-base font-semibold">
            {name}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge size="sm" variant="outline" className="font-mono" dir="ltr">
              {symbol}
            </Badge>
            {tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
          {description ? (
            <p dir="auto" className="line-clamp-3 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
