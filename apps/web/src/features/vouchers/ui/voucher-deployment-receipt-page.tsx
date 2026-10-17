import { formatOfferingDisplayPrice } from "@clc/core/features/market/logic";
import { voucherMintAmountSchema } from "@clc/core/features/vouchers/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RiLoader4Line } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Field } from "#/components/ui/field";
import { InfoRow } from "#/components/ui/info-row";
import { Input } from "#/components/ui/input";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import { useVoucherMint } from "#/features/vouchers/hooks/use-voucher-mint";
import { useVoucherSupply } from "#/features/vouchers/hooks/use-voucher-supply";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { useDeploymentContract } from "#/hooks/use-deployment";
import { RELAYER_URL } from "#/lib/relayer-config";
import { exitVoucherCreateHistory } from "#/lib/navigation/voucher-create-history";

const relayerClient = createRelayerClient(RELAYER_URL);

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
    if (!confirmed || !contract.address) return;
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
      search: {
        trackingId,
        mintTrackingId: result.trackingId,
        mintAmount: parsed.data,
      },
      replace: true,
    });
  };

  // The issuer chose the opening supply while creating the voucher, so once the
  // contract confirms it is minted without another tap. Anything the guards
  // below reject leaves the manual mint step in place as the recovery path.
  const autoMintAttempted = useRef(false);
  useEffect(() => {
    if (autoMintAttempted.current) return;
    if (!mintAmount || activeMintTrackingId !== null) return;
    if (!confirmed || !contract.address || !contract.admin || !walletAddress) return;
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

  // Deployment and minting are separate transactions. The chain supply is the
  // recovery source of truth; the mint tracking ID only provides the receipt.
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
              <Trans>Creating {contract.symbol}...</Trans>
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
            size="lg"
            className="w-full"
            disabled={
              minting ||
              mint.isPending ||
              supplyChecking ||
              ownerUnavailable ||
              ownerMismatch ||
              !walletAddress ||
              walletPreparing
            }
            onClick={primaryAction}
          >
            {minting || mint.isPending || supplyChecking || walletPreparing ? (
              <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
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
      </div>
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
          size="lg"
          className="w-full"
          onClick={() => exit(`/vouchers/${address}?from=vouchers`)}
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
