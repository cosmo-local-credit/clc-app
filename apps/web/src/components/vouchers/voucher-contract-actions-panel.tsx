import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import { voucherMintAmountSchema } from "@clc/core/features/vouchers/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiPencilLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiUserSharedLine,
} from "react-icons/ri";
import { toast } from "sonner";
import { getAddress, isAddress, isAddressEqual, zeroAddress } from "viem";
import { z } from "zod";

import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { RecipientAddressInput } from "#/components/wallet/recipient-address-input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { marketVoucherQueryKeys } from "#/features/home/hooks/use-market-vouchers";
import {
  ownershipKey,
  useOwnershipSubmissions,
} from "#/features/ownership/state/ownership-submissions";
import { RecipientOwnerNotice } from "#/components/safe/recipient-owner-notice";
import { useReportWriteError } from "#/features/safe/hooks/use-report-write-error";
import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { useVoucherMint } from "#/features/vouchers/hooks/use-voucher-mint";
import { useVoucherOwnershipTransfer } from "#/features/vouchers/hooks/use-voucher-ownership-transfer";
import { RetirementControl } from "#/components/retirement/retirement-control";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";

import { VoucherProfileEditorSheet } from "./voucher-profile-editor-sheet";

type VoucherControlSheet = "details" | "mint" | "ownership";

/**
 * Everything the issuer can change about one voucher, in a single group.
 *
 * Contract calls and the catalog record are gated differently — a superadmin may
 * correct any voucher's record, while `mint` and `transferOwnership` are signed
 * by the active owner and submitted through Calibur — but they read as one list
 * of settings, so they share one group rather than a button above a titled card.
 * Each row's label already names the action; a heading and a sentence restating
 * it only push the controls down the screen.
 */
export function VoucherContractActionsPanel({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  ownerAddress,
  walletAddress,
  requesterAddress,
  editable,
}: {
  tokenAddress: string | undefined;
  tokenSymbol: string;
  tokenDecimals: number | undefined;
  ownerAddress: string | null;
  walletAddress: string | undefined;
  requesterAddress?: string;
  /** The catalog record, when the viewer may edit it; null for everyone else. */
  editable: MarketVoucherDetail | null;
}) {
  const { t } = useLingui();
  const [sheet, setSheet] = useState<VoucherControlSheet | null>(null);
  const owner = useAssetOwnerInfo(tokenAddress ?? "", ownerAddress);

  // The owner signs directly; a Safe owner is managed by its signers, who sign
  // as themselves while the Safe stays the on-chain owner.
  const signsAsOwner =
    !!ownerAddress &&
    !!walletAddress &&
    (ownerAddress.toLowerCase() === walletAddress.toLowerCase() || owner.isSafeSigner);
  const contract =
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

  if (!editable && !contract) {
    return null;
  }

  return (
    <>
      <section className="border border-border bg-card" aria-label={t`Voucher controls`}>
        {editable ? (
          <ActionRow
            icon={<RiPencilLine className="size-4" aria-hidden="true" />}
            label={t`Edit details`}
            onClick={() => setSheet("details")}
          />
        ) : null}
        {contract ? (
          <>
            {contract.safeOwned ? (
              <ActionRow
                icon={<RiShieldKeyholeLine className="size-4" aria-hidden="true" />}
                label={t`Safe transactions`}
                onClick={() => useSafeSheet.getState().show(contract.ownerAddress)}
              />
            ) : null}
            <ActionRow
              icon={<RiSparkling2Line className="size-4" aria-hidden="true" />}
              label={t`Create vouchers`}
              onClick={() => setSheet("mint")}
            />
            <ActionRow
              icon={<RiUserSharedLine className="size-4" aria-hidden="true" />}
              label={t`Transfer ownership`}
              onClick={() => setSheet("ownership")}
            />
          </>
        ) : null}
        {/* A Safe signer requests on the Safe's behalf; clc-core records both. */}
        {editable &&
        requesterAddress &&
        (ownerAddress?.toLowerCase() === requesterAddress.toLowerCase() || owner.isSafeSigner) ? (
          <RetirementControl
            type="voucher"
            address={editable.address}
            name={editable.name}
            viewer={requesterAddress}
            active={editable.active}
          />
        ) : null}
      </section>

      {editable ? (
        <>
          <VoucherProfileEditorSheet
            open={sheet === "details"}
            voucher={editable}
            onClose={() => setSheet(null)}
          />
        </>
      ) : null}

      {contract ? (
        <>
          <VoucherMintSheet
            open={sheet === "mint"}
            onClose={() => setSheet(null)}
            tokenAddress={contract.tokenAddress}
            tokenSymbol={tokenSymbol}
            tokenDecimals={contract.tokenDecimals}
            walletAddress={contract.walletAddress}
            ownerAddress={contract.ownerAddress}
            safeOwned={contract.safeOwned}
          />
          <VoucherOwnershipTransferSheet
            open={sheet === "ownership"}
            onClose={() => setSheet(null)}
            tokenAddress={contract.tokenAddress}
            ownerAddress={contract.ownerAddress}
            walletAddress={contract.walletAddress}
          />
        </>
      ) : null}
    </>
  );
}

function VoucherMintSheet({
  open,
  onClose,
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  walletAddress,
  ownerAddress,
  safeOwned,
}: {
  open: boolean;
  onClose: () => void;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  walletAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  /** A multisig's supply can go straight to another account; it defaults to the multisig. */
  safeOwned: boolean;
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

  const pending = mint.isPending || delegationStatus === "checking";

  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Create vouchers</Trans>
            </SheetTitle>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <div className="space-y-4 px-6 pb-3">
              <form.Field name="amount">
                {(field) => (
                  <Field
                    label={t`Create vouchers`}
                    htmlFor="voucher-mint-amount"
                    hint={tokenSymbol}
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-mint-amount"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="0"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      disabled={pending}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </Field>
                )}
              </form.Field>
              {safeOwned ? (
                <form.Field name="recipient">
                  {(field) => (
                    <Field
                      label={t`Recipient`}
                      htmlFor="voucher-mint-recipient"
                      error={getFieldError(field.state.meta.errors)}
                    >
                      <RecipientAddressInput
                        id="voucher-mint-recipient"
                        defaultValue={field.state.value}
                        onValueChange={field.handleChange}
                        onRecipientChange={(recipient) => {
                          if (recipient) field.handleChange(recipient.address);
                        }}
                        onBlur={field.handleBlur}
                        ariaLabel={t`Recipient`}
                        ariaInvalid={field.state.meta.errors.length > 0}
                        disabled={pending}
                      />
                    </Field>
                  )}
                </form.Field>
              ) : null}
            </div>
            <SheetFooter className="border-t border-border px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button type="submit" tap className="w-full" pending={pending}>
                {delegationStatus === "checking" ? (
                  <Trans>Preparing wallet…</Trans>
                ) : pending ? (
                  <Trans>Creating vouchers…</Trans>
                ) : (
                  <Trans>Create vouchers</Trans>
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function VoucherOwnershipTransferSheet({
  open,
  onClose,
  tokenAddress,
  ownerAddress,
  walletAddress,
}: {
  open: boolean;
  onClose: () => void;
  tokenAddress: string;
  ownerAddress: `0x${string}`;
  walletAddress: `0x${string}`;
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
          ownerAddress: walletAddress,
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

  const pending = transferOwnership.isPending || (!submission && delegationStatus === "checking");

  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Transfer ownership</Trans>
            </SheetTitle>
            <p className="text-muted-foreground text-sm">
              <Trans>The new owner can create vouchers and transfer ownership.</Trans>
            </p>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <div className="px-6 pb-3">
              {submission ? (
                <p role="status" className="mb-3 break-all text-xs">
                  <Trans>Check the existing submission before another transfer:</Trans>{" "}
                  <span className="font-mono">{submission.trackingId}</span>
                </p>
              ) : null}
              <form.Field name="newOwnerAddress">
                {(field) => (
                  <Field
                    label={t`New owner address`}
                    htmlFor="voucher-new-owner"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <RecipientAddressInput
                      id="voucher-new-owner"
                      defaultValue={field.state.value}
                      onValueChange={field.handleChange}
                      onRecipientChange={(recipient) => {
                        if (recipient) field.handleChange(recipient.address);
                      }}
                      onBlur={field.handleBlur}
                      ariaLabel={t`New owner address`}
                      disabled={pending || !!submission}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <RecipientOwnerNotice address={field.state.value} />
                  </Field>
                )}
              </form.Field>
            </div>
            <SheetFooter className="border-t border-border px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button type="submit" tap className="w-full" pending={pending}>
                {!submission && delegationStatus === "checking" ? (
                  <Trans>Preparing wallet…</Trans>
                ) : pending ? (
                  <Trans>Transferring ownership…</Trans>
                ) : submission ? (
                  <Trans>Check transfer status</Trans>
                ) : (
                  <Trans>Transfer ownership</Trans>
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
