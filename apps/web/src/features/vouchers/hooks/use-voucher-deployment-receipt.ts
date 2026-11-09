import { createRelayerClient } from "@clc/api/features/relayer/client";
import { formatOfferingDisplayPrice } from "@clc/core/features/market/logic";
import { voucherMintAmountSchema } from "@clc/core/features/vouchers/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConnection } from "wagmi";

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

/**
 * The voucher receipt's state machine, shared by the phone page and the
 * desktop view: deployment tracking, the opening mint (automatic when the
 * amount came from the form, manual otherwise) and its recovery paths.
 *
 * `phase` is the screen to draw: no tracking id, a failed or pending
 * deployment, a deployed voucher still without supply, or a live one.
 */
export function useVoucherDeploymentReceipt({
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

  const [supply, setSupplyValue] = useState(mintAmount ?? "");
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

  const failed =
    tracking.outcome.kind === "error" || contractQuery.isError || contract?.status === "FAILED";
  const failureMessage =
    tracking.outcome.kind === "error"
      ? tracking.outcome.error
      : contractQuery.error instanceof Error
        ? contractQuery.error.message
        : t`The voucher could not be published.`;
  const phase = !trackingId
    ? ("missing" as const)
    : failed
      ? ("failed" as const)
      : !confirmed || !contract.address
        ? ("deploying" as const)
        : minted
          ? ("live" as const)
          : ("supply" as const);

  const voucherValue = draft?.price ?? voucherDetail.data?.voucherValue ?? null;
  const voucherUnit = draft?.unitOfAccount ?? voucherDetail.data?.voucherUoa ?? null;
  const symbol = contract?.symbol ?? "";
  const supplyValue = formatOfferingDisplayPrice(supply, voucherValue, voucherUnit, symbol);

  // Deployment and minting are separate transactions. The chain supply is the
  // recovery source of truth; the mint tracking ID only provides the receipt.
  const trackingUnavailable = activeMintTrackingId !== null && mintTracking.isError;
  const trackingError = trackingUnavailable
    ? mintTracking.error instanceof Error
      ? mintTracking.error.message
      : t`Supply creation status is temporarily unavailable.`
    : null;
  const mintError =
    !trackingUnavailable && mintTracking.outcome.kind === "error"
      ? mintTracking.outcome.error
      : null;
  const mintFailed = mintError !== null;
  const minting = activeMintTrackingId !== null && !mintFailed && !trackingUnavailable;
  const supplyChecking = voucherSupply.isPending && activeMintTrackingId === null;
  const supplyCheckFailed = voucherSupply.isError && activeMintTrackingId === null;
  const ownerUnavailable = contract?.admin === null;
  const ownerMismatch = Boolean(
    contract?.admin &&
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

  const chainSupply =
    voucherSupply.data && BigInt(voucherSupply.data) > 0n && decimals !== null
      ? formatTokenAmount(voucherSupply.data, decimals, decimals)
      : "";
  const publishedSupply = chainSupply || mintAmount || supply.trim();
  const publishedSupplyValue = publishedSupply
    ? formatOfferingDisplayPrice(publishedSupply, voucherValue, voucherUnit, symbol)
    : null;

  return {
    phase,
    failureMessage,
    contract,
    draft,
    voucherDetail: voucherDetail.data,
    decimals,
    deploymentTxHash: tracking.outcome.kind === "success" ? tracking.outcome.otx.txHash : "",
    mintTxHash: mintTracking.outcome.kind === "success" ? mintTracking.outcome.otx.txHash : "",
    walletAddress,
    walletPreparing,
    supply,
    setSupply: (next: string) => {
      setSupplyValue(next);
      setSupplyError(null);
    },
    supplyError,
    supplyValue,
    mintPending: mint.isPending,
    mintError,
    mintFailed,
    minting,
    trackingUnavailable,
    supplyChecking,
    supplyCheckFailed,
    ownerUnavailable,
    ownerMismatch,
    blockingMessage,
    pendingState: minting || supplyChecking || trackingUnavailable,
    primaryAction,
    publishedSupply,
    publishedSupplyValue,
    exit,
    copyValue,
  };
}
