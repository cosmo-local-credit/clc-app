import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import {
  voucherBurnAmountSchema,
  voucherMintAmountSchema,
} from "@clc/core/features/vouchers/logic";
import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { useForm } from "@clc/core/lib/forms";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAddress, isAddress, isAddressEqual, zeroAddress } from "viem";
import { z } from "zod";

import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import {
  ownershipKey,
  useOwnershipSubmissions,
} from "#/features/ownership/state/ownership-submissions";
import { useReportWriteError } from "#/features/safe/hooks/use-report-write-error";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";

import {
  useVoucherBurn,
  useVoucherOwnerBalance,
  voucherOwnerBalanceQueryKeys,
} from "./use-voucher-burn";
import { useVoucherMint } from "./use-voucher-mint";
import { useVoucherOwnershipTransfer } from "./use-voucher-ownership-transfer";

/** A voucher whose contract calls the connected wallet may sign. */
export type VoucherContractControl = {
  tokenAddress: string;
  tokenDecimals: number;
  ownerAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  safeOwned: boolean;
};

/**
 * Who may do what to one voucher. The owner signs directly; a Safe owner is
 * managed by its signers, who sign as themselves while the Safe stays the
 * on-chain owner. `contract` is null when the connected wallet cannot sign.
 */
export function useVoucherControls({
  tokenAddress,
  tokenDecimals,
  ownerAddress,
  walletAddress,
  requesterAddress,
}: {
  tokenAddress: string | undefined;
  tokenDecimals: number | undefined;
  ownerAddress: string | null;
  walletAddress: string | undefined;
  requesterAddress?: string;
}) {
  const owner = useAssetOwnerInfo(tokenAddress ?? "", ownerAddress);
  const signsAsOwner =
    !!ownerAddress &&
    !!walletAddress &&
    (ownerAddress.toLowerCase() === walletAddress.toLowerCase() || owner.isSafeSigner);
  const contract: VoucherContractControl | null =
    tokenAddress &&
    ownerAddress &&
    walletAddress &&
    signsAsOwner &&
    tokenDecimals !== undefined &&
    Number.isInteger(tokenDecimals) &&
    tokenDecimals >= 0
      ? {
          tokenAddress,
          tokenDecimals,
          ownerAddress: ownerAddress as `0x${string}`,
          walletAddress: walletAddress as `0x${string}`,
          safeOwned: owner.isSafeOwned,
        }
      : null;
  // A Safe signer requests retirement on the Safe's behalf; clc-core records both.
  const canRequestRetirement =
    !!requesterAddress &&
    (ownerAddress?.toLowerCase() === requesterAddress.toLowerCase() || owner.isSafeSigner);
  return { contract, canRequestRetirement };
}

/** Minting more of a voucher, signed by its owner (or a signer of its Safe). */
export function useVoucherMintForm({
  tokenAddress,
  tokenDecimals,
  walletAddress,
  ownerAddress,
  safeOwned,
  onClose,
}: {
  tokenAddress: string;
  tokenDecimals: number;
  walletAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  /** A multisig's supply can go straight to another account; it defaults to the multisig. */
  safeOwned: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const delegationStatus = useCaliburDelegation(walletAddress);
  const mint = useVoucherMint({ address: tokenAddress, ownerAddress });
  const recipientSchema = z
    .string()
    .trim()
    .refine((value) => isAddress(value, { strict: false }) && !isAddressEqual(value, zeroAddress), {
      message: t`Enter a valid wallet address`,
    });
  const form = useForm({
    defaultValues: { amount: "", recipient: ownerAddress as string },
    validators: {
      onSubmit: z.object({
        amount: voucherMintAmountSchema(tokenDecimals),
        recipient: safeOwned ? recipientSchema : z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await mint.mutateAsync({
          tokenAddress: tokenAddress as `0x${string}`,
          ownerAddress,
          ...(safeOwned ? { recipientAddress: getAddress(value.recipient.trim()) } : {}),
          amountRaw: parseTokenAmount(value.amount, tokenDecimals),
          includeAuthorization: delegationStatus === "not-delegated",
        });
        void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
        toast.success(t`Voucher creation submitted.`);
        onClose();
      } catch (error) {
        if (mint.reportError(error, t`Couldn't create vouchers.`)) onClose();
      }
    },
  });

  return {
    form,
    delegationStatus,
    // A mint still running from another view (a layout switch remounts every
    // form) holds this one too, so it cannot be submitted twice.
    pending: mint.isPending || mint.inFlight || delegationStatus === "checking",
  };
}

/**
 * Destroying vouchers from the owner's own balance, capped at what the chain
 * says it holds. Never offered for a Safe-owned voucher: clc-core's Safe
 * policy does not allow `burn`. `enabled` gates the balance read to an open form.
 */
export function useVoucherBurnForm({
  tokenAddress,
  tokenDecimals,
  ownerAddress,
  enabled,
  onClose,
}: {
  tokenAddress: `0x${string}`;
  tokenDecimals: number;
  ownerAddress: `0x${string}`;
  enabled: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const delegationStatus = useCaliburDelegation(ownerAddress);
  const burn = useVoucherBurn(tokenAddress);
  const reportError = useReportWriteError();
  const balance = useVoucherOwnerBalance(tokenAddress, ownerAddress, enabled);
  const form = useForm({
    defaultValues: { amount: "" },
    validators: {
      onSubmit: z.object({
        amount: voucherBurnAmountSchema(
          tokenDecimals,
          balance.data === undefined ? undefined : BigInt(balance.data),
        ),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await burn.mutateAsync({
          tokenAddress,
          ownerAddress,
          amountRaw: parseTokenAmount(value.amount, tokenDecimals),
          includeAuthorization: delegationStatus === "not-delegated",
        });
        void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: voucherOwnerBalanceQueryKeys.all });
        toast.success(t`Voucher destruction submitted.`);
        form.reset();
        onClose();
      } catch (error) {
        if (reportError(error, t`Couldn't destroy vouchers.`)) onClose();
      }
    },
  });

  const burning = burn.isPending || burn.inFlight;
  return {
    form,
    delegationStatus,
    burning,
    // isLoading, not isPending: the balance query is disabled while the form is
    // closed, and a disabled query stays pending, which would wedge the button.
    pending: burning || delegationStatus === "checking" || balance.isLoading,
    /** The owner's on-chain balance at full precision; undefined until read. */
    balance:
      balance.data === undefined
        ? undefined
        : formatTokenAmount(balance.data, tokenDecimals, tokenDecimals),
  };
}

/** Handing a voucher to a new owner, resumable from a recorded submission. */
export function useVoucherOwnershipTransferForm({
  tokenAddress,
  ownerAddress,
  walletAddress,
  onClose,
}: {
  tokenAddress: string;
  ownerAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const delegationStatus = useCaliburDelegation(walletAddress);
  const transferOwnership = useVoucherOwnershipTransfer({ address: tokenAddress, ownerAddress });
  const reportError = useReportWriteError();
  const submission = useOwnershipSubmissions(
    (state) => state.submissions[ownershipKey(tokenAddress)],
  );
  const form = useForm({
    defaultValues: { newOwnerAddress: String(submission?.newOwnerAddress ?? "") },
    validators: {
      onSubmit: z.object({
        newOwnerAddress: ownershipRecipientSchema(ownerAddress, [tokenAddress]),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await transferOwnership.mutateAsync({
          tokenAddress: tokenAddress as `0x${string}`,
          ownerAddress,
          newOwnerAddress: value.newOwnerAddress as `0x${string}`,
          includeAuthorization: delegationStatus === "not-delegated",
        });
        void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
        if (result?.catalogSynced === false)
          toast.info(
            t`Ownership transferred on-chain. Catalog synchronization is delayed; your management controls have been removed.`,
          );
        else toast.success(t`Ownership transferred.`);
        onClose();
      } catch (error) {
        if (reportError(error, t`Couldn't transfer ownership.`)) onClose();
      }
    },
  });

  return {
    form,
    submission,
    delegationStatus,
    pending:
      transferOwnership.isPending ||
      transferOwnership.inFlight ||
      (!submission && delegationStatus === "checking"),
  };
}
