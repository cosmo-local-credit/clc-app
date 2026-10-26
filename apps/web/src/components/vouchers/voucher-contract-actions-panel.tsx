import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import { voucherMintAmountSchema } from "@clc/core/features/vouchers/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RiPencilLine, RiSparkling2Line, RiUserSharedLine } from "react-icons/ri";
import { toast } from "sonner";
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

  const contract =
    tokenAddress &&
    ownerAddress &&
    walletAddress &&
    ownerAddress.toLowerCase() === walletAddress.toLowerCase() &&
    tokenDecimals !== undefined &&
    Number.isInteger(tokenDecimals) &&
    tokenDecimals >= 0
      ? {
          tokenAddress,
          tokenDecimals,
          ownerAddress: ownerAddress as `0x${string}`,
          walletAddress: walletAddress as `0x${string}`,
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
        {editable &&
        requesterAddress &&
        ownerAddress?.toLowerCase() === requesterAddress.toLowerCase() ? (
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
}: {
  open: boolean;
  onClose: () => void;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  walletAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const delegationStatus = useCaliburDelegation(walletAddress);
  const mint = useVoucherMint();
  const form = useForm({
    defaultValues: { amount: "" },
    validators: { onSubmit: z.object({ amount: voucherMintAmountSchema(tokenDecimals) }) },
    onSubmit: async ({ value }) => {
      try {
        await mint.mutateAsync({
          tokenAddress: tokenAddress as `0x${string}`,
          ownerAddress: walletAddress,
          amountRaw: parseTokenAmount(value.amount, tokenDecimals),
          includeAuthorization: delegationStatus === "not-delegated",
        });
        void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
        toast.success(t`Voucher creation submitted.`);
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t`Couldn't create vouchers.`);
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
            <div className="px-6 pb-3">
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
  const transferOwnership = useVoucherOwnershipTransfer();
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
        toast.error(error instanceof Error ? error.message : t`Couldn't transfer ownership.`);
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
