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
import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import { useVoucherMint } from "#/features/vouchers/hooks/use-voucher-mint";
import { useVoucherSupply } from "#/features/vouchers/hooks/use-voucher-supply";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
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

  const decimals = contract.decimals ?? (draft ? Number(draft.decimals) : null);
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
        : t`Mint status is temporarily unavailable.`
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
    const walletPreparing = delegationStatus === "checking";
    const submitMint = async () => {
      if (mintSubmissionInFlight.current) return;
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
        toast.error(t`Connect your wallet to mint.`);
        return;
      }
      if (!contract.admin) {
        toast.error(t`Couldn't verify who owns this voucher.`);
        return;
      }
      if (contract.admin.toLowerCase() !== walletAddress.toLowerCase()) {
        toast.error(t`Reconnect the wallet that published this voucher to mint.`);
        return;
      }
      if (walletPreparing) return;
      setSupplyError(null);
      mintSubmissionInFlight.current = true;

      const result = await mint
        .mutateAsync({
          tokenAddress: address,
          ownerAddress: contract.admin,
          amountRaw: parseTokenAmount(parsed.data, decimals),
          includeAuthorization: delegationStatus === "not-delegated",
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : t`Couldn't mint the first supply.`);
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
      ? t`Reconnect the wallet that published this voucher to mint.`
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
              <Trans>Minting failed</Trans>
            ) : trackingUnavailable ? (
              <Trans>Checking mint status</Trans>
            ) : supplyCheckFailed ? (
              <Trans>Supply check unavailable</Trans>
            ) : minting ? (
              <Trans>Minting {contract.symbol}...</Trans>
            ) : (
              <Trans>{contract.symbol} is deployed</Trans>
            )}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {mintError ??
              blockingMessage ??
              (supplyCheckFailed
                ? t`We couldn't verify whether this voucher already has supply.`
                : t`Mint the first supply to finish publishing this voucher.`)}
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

        <dl className="mt-6 border border-border bg-card">{detailRows}</dl>

        <div className="mt-3.5">
          <Field label={t`First supply`} htmlFor="voucher-supply" error={supplyError}>
            <Input
              id="voucher-supply"
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
        </div>

        <div className="mt-auto pt-6">
          <Button
            className="h-11 w-full"
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
              <Trans>Check mint status</Trans>
            ) : supplyCheckFailed ? (
              <Trans>Check supply again</Trans>
            ) : minting ? (
              <Trans>Minting…</Trans>
            ) : supplyChecking ? (
              <Trans>Checking supply…</Trans>
            ) : walletPreparing ? (
              <Trans>Preparing wallet…</Trans>
            ) : mintFailed ? (
              <Trans>Try again</Trans>
            ) : (
              <Trans>Mint supply</Trans>
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
        {detailRows}
        {publishedSupply ? (
          <InfoRow label={t`Supply`}>{`${publishedSupply} ${contract.symbol}`}</InfoRow>
        ) : null}
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
          <InfoRow label={t`Mint transaction`}>
            <CopyableInfoValue
              value={mintTxHash}
              label={t`Copy mint transaction hash`}
              onCopy={(value) =>
                copyValue(
                  value,
                  t`Mint transaction hash copied`,
                  t`Couldn't copy mint transaction hash`,
                )
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
