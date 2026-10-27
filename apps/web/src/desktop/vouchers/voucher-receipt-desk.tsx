import { createRelayerClient } from "@clc/api/features/relayer/client";
import { formatOfferingDisplayPrice } from "@clc/core/features/market/logic";
import { voucherMintAmountSchema } from "@clc/core/features/vouchers/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RiArrowDownSLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Field } from "#/components/ui/field";
import { InfoRow } from "#/components/ui/info-row";
import { Input } from "#/components/ui/input";
import { TagBadge } from "#/components/ui/tag-badge";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { DeskCanvas, DeskEyebrow, DeskTitle } from "#/desktop/ui/page";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import { useVoucherMint } from "#/features/vouchers/hooks/use-voucher-mint";
import { useVoucherSupply } from "#/features/vouchers/hooks/use-voucher-supply";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { useDeploymentContract } from "#/hooks/use-deployment";
import { exitVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

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
  const router = useRouter();
  const navigate = useNavigate({ from: "/vouchers/create/receipt" });
  const queryClient = useQueryClient();
  const { address: walletAddress } = useConnection();
  const delegationStatus = useCaliburDelegation(walletAddress as `0x${string}` | undefined);
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
  const voucherDetail = useMarketVoucherDetail(
    confirmed && !draft ? (contract?.address ?? undefined) : undefined,
  );

  const [supply, setSupply] = useState(mintAmount ?? "");
  const [supplyError, setSupplyError] = useState<string | null>(null);
  const [submittedMintTrackingId, setSubmittedMintTrackingId] = useState<string | null>(null);
  const mintSubmissionInFlight = useRef(false);
  const activeMintTrackingId = submittedMintTrackingId ?? mintTrackingId ?? null;
  const mint = useVoucherMint();
  const mintTracking = useOtxTracking(activeMintTrackingId, {
    queryKey: "voucher-mint-track",
    queryFn: async (nextTrackingId) => (await relayerClient.trackRelay(nextTrackingId)).result,
  });
  const voucherSupply = useVoucherSupply(
    confirmed && contract?.address ? contract.address : undefined,
  );
  const trackedMinted = mintTracking.outcome.kind === "success";
  const onChainMinted = voucherSupply.data !== undefined && BigInt(voucherSupply.data) > 0n;
  const minted = trackedMinted || onChainMinted;

  useEffect(() => {
    if (activeMintTrackingId && !mintTracking.isError && mintTracking.outcome.kind === "error") {
      mintSubmissionInFlight.current = false;
    }
  }, [activeMintTrackingId, mintTracking.isError, mintTracking.outcome.kind]);

  useEffect(() => {
    if (!confirmed) return;
    void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
  }, [confirmed, queryClient]);

  useEffect(() => {
    if (!minted) return;
    void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
  }, [minted, queryClient]);

  const decimals = contract?.decimals ?? (draft ? Number(draft.decimals) : null);
  const walletPreparing = delegationStatus === "checking";

  const submitMint = async () => {
    if (mintSubmissionInFlight.current) return;
    if (!confirmed || !contract?.address) return;
    if (decimals === null || !Number.isInteger(decimals)) {
      toast.error(t`Couldn't read how many decimals this voucher uses.`);
      return;
    }
    if (voucherSupply.data === undefined || BigInt(voucherSupply.data) > 0n) return;
    const parsed = voucherMintAmountSchema(decimals).safeParse(supply);
    if (!parsed.success) {
      setSupplyError(parsed.error.issues[0]?.message ?? "Supply must be greater than zero");
      return;
    }
    if (!walletAddress) {
      toast.error(t`Connect your wallet to create vouchers.`);
      return;
    }
    if (!contract.admin) {
      toast.error(t`Couldn't verify who owns this voucher.`);
      return;
    }
    if (contract.admin.toLowerCase() !== walletAddress.toLowerCase()) {
      toast.error(t`Reconnect the wallet that published this voucher to create its supply.`);
      return;
    }
    if (walletPreparing) return;
    setSupplyError(null);
    mintSubmissionInFlight.current = true;

    const result = await mint
      .mutateAsync({
        tokenAddress: contract.address,
        ownerAddress: contract.admin,
        amountRaw: parseTokenAmount(parsed.data, decimals),
        includeAuthorization: delegationStatus === "not-delegated",
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t`Couldn't create the first supply.`);
        return null;
      });
    if (!result) {
      mintSubmissionInFlight.current = false;
      return;
    }
    setSubmittedMintTrackingId(result.trackingId);
    void navigate({
      to: "/vouchers/create/receipt",
      search: { trackingId, mintTrackingId: result.trackingId, mintAmount: parsed.data },
      replace: true,
    });
  };

  const autoMintAttempted = useRef(false);
  useEffect(() => {
    if (autoMintAttempted.current) return;
    if (!mintAmount || activeMintTrackingId !== null) return;
    if (!confirmed || !contract?.address || !contract.admin || !walletAddress) return;
    if (contract.admin.toLowerCase() !== walletAddress.toLowerCase()) return;
    if (walletPreparing) return;
    if (voucherSupply.data !== "0") return;
    autoMintAttempted.current = true;
    void submitMint();
  }, [
    activeMintTrackingId,
    confirmed,
    contract,
    mintAmount,
    submitMint,
    voucherSupply.data,
    walletAddress,
    walletPreparing,
  ]);

  const exit = (destination: string) => {
    clearDraft();
    exitVoucherCreateHistory({ history: router.history, destination });
  };

  if (!trackingId) {
    return (
      <ReceiptState
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
      <ReceiptState
        icon={<FailureCross />}
        title={t`Publishing failed`}
        message={message}
        status={<StatusPill tone="error" label={t`Failed`} />}
      />
    );
  }

  if (!confirmed || !contract?.address) {
    return (
      <ReceiptState
        icon={<PendingClock />}
        title={t`Publishing your voucher…`}
        message={t`Waiting for blockchain confirmation…`}
        status={<StatusPill tone="pending" label={t`Pending`} />}
        showContractRow
      />
    );
  }

  const address = contract.address;
  const deploymentTxHash = tracking.outcome.kind === "success" ? tracking.outcome.otx.txHash : "";
  const mintTxHash = mintTracking.outcome.kind === "success" ? mintTracking.outcome.otx.txHash : "";
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
  const voucherValue = draft?.price ?? voucherDetail.data?.voucherValue ?? null;
  const voucherUnit = draft?.unitOfAccount ?? voucherDetail.data?.voucherUoa ?? null;
  const supplyValue = formatOfferingDisplayPrice(
    supply,
    voucherValue,
    voucherUnit,
    contract.symbol,
  );
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

  const preview = (
    <VoucherPreview
      name={contract.name}
      symbol={contract.symbol}
      tags={draft?.tags ?? voucherDetail.data?.tags ?? []}
      description={draft?.description ?? voucherDetail.data?.description ?? null}
    />
  );

  if (!minted) {
    const mintOutcome = mintTracking.outcome;
    const trackingUnavailable = activeMintTrackingId !== null && mintTracking.isError;
    const trackingError = trackingUnavailable
      ? mintTracking.error instanceof Error
        ? mintTracking.error.message
        : t`Supply creation status is temporarily unavailable.`
      : null;
    const mintError =
      !trackingUnavailable && mintOutcome.kind === "error" ? mintOutcome.error : null;
    const mintFailed = mintError !== null;
    const minting = activeMintTrackingId !== null && !mintFailed && !trackingUnavailable;
    const supplyChecking = voucherSupply.isPending && activeMintTrackingId === null;
    const supplyCheckFailed = voucherSupply.isError && activeMintTrackingId === null;
    const ownerUnavailable = contract.admin === null;
    const ownerMismatch = Boolean(
      contract.admin &&
      walletAddress &&
      contract.admin.toLowerCase() !== walletAddress.toLowerCase(),
    );
    const primaryAction = () => {
      if (trackingUnavailable) {
        void mintTracking.refetch();
        return;
      }
      if (supplyCheckFailed) {
        void voucherSupply.refetch();
        return;
      }
      void submitMint();
    };
    const blockingMessage = ownerMismatch
      ? t`Reconnect the wallet that published this voucher to create its supply.`
      : ownerUnavailable
        ? t`Couldn't verify who owns this voucher.`
        : trackingError;
    const pendingState = minting || supplyChecking || trackingUnavailable;

    return (
      <ReceiptLayout
        preview={preview}
        header={
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
            }
            message={
              mintError ??
              blockingMessage ??
              (supplyCheckFailed
                ? t`We couldn't verify whether this voucher already has supply.`
                : t`Create the first supply to finish publishing this voucher.`)
            }
          />
        }
      >
        {mintAmount ? (
          <dl className="border border-border bg-card">
            <InfoRow label={t`Supply`}>
              {supplyValue
                ? `${supplyValue.value} ${supplyValue.unit}`
                : `${supply} ${contract.symbol}`}
            </InfoRow>
          </dl>
        ) : (
          <div>
            <Field label={t`Create vouchers`} htmlFor="desk-voucher-supply" error={supplyError}>
              <Input
                id="desk-voucher-supply"
                dir="ltr"
                inputMode="decimal"
                value={supply}
                onChange={(event) => {
                  setSupply(event.target.value);
                  setSupplyError(null);
                }}
                placeholder="0"
                disabled={
                  minting ||
                  supplyChecking ||
                  supplyCheckFailed ||
                  trackingUnavailable ||
                  ownerUnavailable ||
                  ownerMismatch ||
                  walletPreparing
                }
                aria-invalid={supplyError !== null}
              />
            </Field>
            {supplyValue ? (
              <p className="mt-1 font-mono text-muted-foreground text-xs">
                <Trans>
                  Value: {supplyValue.value} {supplyValue.unit}
                </Trans>
              </p>
            ) : null}
          </div>
        )}
        <DeploymentDetails>{detailRows}</DeploymentDetails>
        <div className="flex">
          <Button
            tap
            disabled={ownerUnavailable || ownerMismatch || !walletAddress}
            pending={minting || mint.isPending || supplyChecking || walletPreparing}
            onClick={primaryAction}
          >
            {trackingUnavailable ? (
              <Trans>Check creation status</Trans>
            ) : supplyCheckFailed ? (
              <Trans>Check supply again</Trans>
            ) : minting ? (
              <Trans>Creating…</Trans>
            ) : supplyChecking ? (
              <Trans>Checking supply…</Trans>
            ) : walletPreparing ? (
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

  const chainSupply =
    voucherSupply.data && BigInt(voucherSupply.data) > 0n && decimals !== null
      ? formatTokenAmount(voucherSupply.data, decimals, decimals)
      : "";
  const publishedSupply = chainSupply || mintAmount || supply.trim();
  const publishedSupplyValue = publishedSupply
    ? formatOfferingDisplayPrice(publishedSupply, voucherValue, voucherUnit, contract.symbol)
    : null;

  return (
    <ReceiptLayout
      preview={preview}
      header={
        <ReceiptHeader
          icon={<SuccessCheck />}
          title={<Trans>{contract.name} is live</Trans>}
          status={<StatusPill tone="success" label={t`Published`} />}
        />
      }
    >
      {publishedSupply ? (
        <dl className="border border-border bg-card">
          <InfoRow label={t`Supply`}>
            {publishedSupplyValue
              ? `${publishedSupplyValue.value} ${publishedSupplyValue.unit}`
              : `${publishedSupply} ${contract.symbol}`}
          </InfoRow>
        </dl>
      ) : null}
      <DeploymentDetails>
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
      </DeploymentDetails>
      <div className="flex">
        <Button tap onClick={() => exit(`/vouchers/${address}?from=vouchers`)}>
          <Trans>View voucher</Trans>
        </Button>
      </div>
    </ReceiptLayout>
  );
}

function DeploymentDetails({ children }: { children: ReactNode }) {
  return (
    <details className="group border-border border-y">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Trans>Advanced details</Trans>
        <RiArrowDownSLine
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <dl className="mb-4 border border-border bg-card">{children}</dl>
    </details>
  );
}

/** `.page.detail` at 1100px: the receipt, and the voucher as the Market will show it. */
function ReceiptLayout({
  header,
  preview,
  children,
}: {
  header: ReactNode;
  preview?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <DeskCanvas
      width="read"
      className="max-w-[1164px] grid-cols-[minmax(0,1fr)_360px] items-start gap-6"
    >
      <div className="grid min-w-0 content-start gap-5">
        {header}
        {children}
      </div>
      {preview ? (
        <div className="sticky top-7 grid min-w-0 content-start gap-2">{preview}</div>
      ) : null}
    </DeskCanvas>
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
    <div className="grid gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="shrink-0">{icon}</span>
        <div className="grid min-w-0 justify-items-start gap-1.5">
          <DeskTitle>
            <span className="[overflow-wrap:anywhere]">{title}</span>
          </DeskTitle>
          {status}
        </div>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function VoucherPreview({
  name,
  symbol,
  tags,
  description,
}: {
  name: string;
  symbol: string;
  tags: readonly string[];
  description: string | null;
}) {
  return (
    <>
      <DeskEyebrow>
        <Trans>Preview · Market</Trans>
      </DeskEyebrow>
      <div className="border border-border bg-card">
        <div className="h-24 bg-voucher" aria-hidden="true" />
        <div className="grid gap-1.5 p-4">
          <p className="truncate font-heading text-base font-semibold">{name}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-mono" dir="ltr">
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

function ReceiptState({
  icon,
  title,
  message,
  status,
  showContractRow = false,
}: {
  icon: ReactNode;
  title: string;
  message: ReactNode;
  status: ReactNode;
  showContractRow?: boolean;
}) {
  const { t } = useLingui();
  return (
    <ReceiptLayout
      header={<ReceiptHeader icon={icon} title={title} status={status} message={message} />}
    >
      {showContractRow ? (
        <dl className="border border-border bg-card">
          <InfoRow label={t`Voucher contract`} muted>
            <Trans>In network</Trans>
          </InfoRow>
        </dl>
      ) : null}
    </ReceiptLayout>
  );
}
