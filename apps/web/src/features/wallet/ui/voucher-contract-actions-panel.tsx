import { voucherMintAmountSchema } from "@clc/core/features/vouchers/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RiLoader4Line } from "react-icons/ri";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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
import { useVoucherMint } from "#/features/vouchers/hooks/use-voucher-mint";
import { useVoucherOwnershipTransfer } from "#/features/vouchers/hooks/use-voucher-ownership-transfer";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";

const addressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value) && value.toLowerCase() !== zeroAddress, {
    message: "Enter a valid wallet address",
  });

/**
 * Contract controls intentionally live apart from catalog-profile editing:
 * these calls are signed by the active owner and submitted through Calibur.
 */
export function VoucherContractActionsPanel({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  ownerAddress,
  walletAddress,
}: {
  tokenAddress: string | undefined;
  tokenSymbol: string;
  tokenDecimals: number | undefined;
  ownerAddress: string | null;
  walletAddress: string | undefined;
}) {
  if (
    !tokenAddress ||
    !ownerAddress ||
    !walletAddress ||
    ownerAddress.toLowerCase() !== walletAddress.toLowerCase() ||
    tokenDecimals === undefined ||
    !Number.isInteger(tokenDecimals) ||
    tokenDecimals < 0
  ) {
    return null;
  }

  return (
    <section className="space-y-3 border border-border bg-card p-4" aria-label="Voucher controls">
      <div>
        <h2 className="font-heading text-[1.125rem] font-semibold leading-tight">
          <Trans>Manage voucher</Trans>
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          <Trans>Signed contract actions for this voucher.</Trans>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <VoucherMintSheet
          tokenAddress={tokenAddress}
          tokenSymbol={tokenSymbol}
          tokenDecimals={tokenDecimals}
          walletAddress={walletAddress as `0x${string}`}
        />
        <VoucherOwnershipTransferSheet
          tokenAddress={tokenAddress}
          ownerAddress={ownerAddress as `0x${string}`}
          walletAddress={walletAddress as `0x${string}`}
        />
      </div>
    </section>
  );
}

function VoucherMintSheet({
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  walletAddress,
}: {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  walletAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
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
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t`Couldn't create vouchers.`);
      }
    },
  });

  const pending = mint.isPending || delegationStatus === "checking";

  return (
    <SheetRoot open={open} onOpenChange={setOpen}>
      <Button type="button" className="h-11" onClick={() => setOpen(true)}>
        <Trans>Create vouchers</Trans>
      </Button>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Create vouchers</Trans>
            </SheetTitle>
            <p className="text-muted-foreground text-sm">
              <Trans>Mint new vouchers to your wallet.</Trans>
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
              <Button type="submit" className="h-11 w-full" disabled={pending}>
                {pending ? (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
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
  tokenAddress,
  ownerAddress,
  walletAddress,
}: {
  tokenAddress: string;
  ownerAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const delegationStatus = useCaliburDelegation(walletAddress);
  const transferOwnership = useVoucherOwnershipTransfer();
  const form = useForm({
    defaultValues: { newOwnerAddress: "" },
    validators: {
      onSubmit: z
        .object({ newOwnerAddress: addressSchema })
        .refine((value) => value.newOwnerAddress.toLowerCase() !== ownerAddress.toLowerCase(), {
          path: ["newOwnerAddress"],
          message: "New owner must be a different wallet",
        }),
    },
    onSubmit: async ({ value }) => {
      try {
        await transferOwnership.mutateAsync({
          tokenAddress: tokenAddress as `0x${string}`,
          ownerAddress: walletAddress,
          newOwnerAddress: value.newOwnerAddress as `0x${string}`,
          includeAuthorization: delegationStatus === "not-delegated",
        });
        void queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: marketVoucherQueryKeys.all });
        toast.success(t`Ownership transfer submitted.`);
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t`Couldn't transfer ownership.`);
      }
    },
  });

  const pending = transferOwnership.isPending || delegationStatus === "checking";

  return (
    <SheetRoot open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        className="h-11 bg-card"
        onClick={() => setOpen(true)}
      >
        <Trans>Transfer ownership</Trans>
      </Button>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
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
              <form.Field name="newOwnerAddress">
                {(field) => (
                  <Field
                    label={t`New owner address`}
                    htmlFor="voucher-new-owner"
                    error={getFieldError(field.state.meta.errors)}
                  >
                    <Input
                      id="voucher-new-owner"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="0x…"
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
              <Button type="submit" className="h-11 w-full" disabled={pending}>
                {pending ? (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {delegationStatus === "checking" ? (
                  <Trans>Preparing wallet…</Trans>
                ) : pending ? (
                  <Trans>Transferring ownership…</Trans>
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
