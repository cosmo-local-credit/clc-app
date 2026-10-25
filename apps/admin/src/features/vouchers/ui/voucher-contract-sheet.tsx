import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import {
  buildAddVoucherWriterCall,
  buildDeleteVoucherWriterCall,
  buildVoucherMintCall,
  buildVoucherOwnershipTransferCall,
  voucherMintAmountSchema,
} from "@clc/core/features/vouchers/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";
import { z } from "zod";

import { ConfirmDialog } from "#/components/admin/confirm-dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { sameAddress, useOperatorAddress } from "#/features/operator/operator-address";
import { useOperatorCalls } from "#/features/operator/use-operator-calls";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { adminKeys } from "@clc/api/features/admin/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const addressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value) && value.toLowerCase() !== zeroAddress, "Enter an address");

export function VoucherContractSheet({
  voucher,
  open,
  onClose,
}: {
  voucher: MarketVoucherDetail;
  open: boolean;
  onClose: () => void;
}) {
  const operator = useOperatorAddress();
  const calls = useOperatorCalls();
  const retire = useRetireVoucher(voucher.address);
  const canSign = sameAddress(operator, voucher.ownerAddress);
  const [retiring, setRetiring] = useState(false);
  const pending = calls.isPending || retire.isPending;

  async function send(label: string, call: Parameters<typeof calls.mutateAsync>[0][number]) {
    try {
      await calls.mutateAsync([call]);
      toast.success(label);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const mint = useForm({
    defaultValues: { amount: "" },
    onSubmit: ({ value }) => {
      const decimals = voucher.decimals ?? 0;
      voucherMintAmountSchema(decimals).parse(value.amount);
      if (!operator) throw new Error("Load a signing key before minting.");
      void send(
        "Vouchers minted",
        buildVoucherMintCall({
          tokenAddress: voucher.address,
          ownerAddress: operator,
          amountRaw: parseTokenAmount(value.amount.trim(), decimals),
        }),
      );
    },
  });

  const writer = useForm({
    defaultValues: { address: "" },
    onSubmit: () => undefined,
  });

  const owner = useForm({
    defaultValues: { recipient: "" },
    onSubmit: ({ value }) => {
      ownershipRecipientSchema(voucher.ownerAddress ?? "", [voucher.address]).parse(
        value.recipient,
      );
      void send(
        "Ownership transferred",
        buildVoucherOwnershipTransferCall({
          tokenAddress: voucher.address,
          newOwnerAddress: value.recipient as `0x${string}`,
        }),
      );
    },
  });

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <SheetContent className="w-full bg-card shadow-none data-[side=right]:sm:max-w-[32rem]">
        <SheetHeader className="border-border border-b">
          <SheetTitle>Voucher controls</SheetTitle>
          <SheetDescription>{voucher.symbol}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {canSign ? (
            <>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mint.handleSubmit();
                }}
              >
                <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
                  Mint
                </h2>
                <mint.Field name="amount">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Amount</Label>
                      <Input
                        id={field.name}
                        inputMode="decimal"
                        className="font-data"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldError message={getFieldError(field.state.meta.errors)} />
                    </div>
                  )}
                </mint.Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Working…" : "Mint"}
                </Button>
              </form>

              <section className="space-y-3">
                <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
                  Writers
                </h2>
                <writer.Field name="address">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="writer-address">Address</Label>
                      <Input
                        id="writer-address"
                        className="font-data"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </div>
                  )}
                </writer.Field>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      const parsed = addressSchema.safeParse(writer.state.values.address);
                      if (!parsed.success) {
                        toast.error(parsed.error.issues[0]?.message ?? "Enter an address");
                        return;
                      }
                      void send(
                        "Writer added",
                        buildAddVoucherWriterCall({
                          tokenAddress: voucher.address,
                          writerAddress: parsed.data as `0x${string}`,
                        }),
                      );
                    }}
                  >
                    Add writer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      const parsed = addressSchema.safeParse(writer.state.values.address);
                      if (!parsed.success) {
                        toast.error(parsed.error.issues[0]?.message ?? "Enter an address");
                        return;
                      }
                      void send(
                        "Writer removed",
                        buildDeleteVoucherWriterCall({
                          tokenAddress: voucher.address,
                          writerAddress: parsed.data as `0x${string}`,
                        }),
                      );
                    }}
                  >
                    Remove writer
                  </Button>
                </div>
              </section>

              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void owner.handleSubmit();
                }}
              >
                <h2 className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
                  Ownership
                </h2>
                <owner.Field name="recipient">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>New owner</Label>
                      <Input
                        id={field.name}
                        className="font-data"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldError message={getFieldError(field.state.meta.errors)} />
                    </div>
                  )}
                </owner.Field>
                <Button type="submit" disabled={pending}>
                  Transfer ownership
                </Button>
              </form>

              {voucher.active ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setRetiring(true)}
                >
                  Retire
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
      <ConfirmDialog
        open={retiring}
        title="Retire voucher"
        description={`${voucher.symbol} leaves the public catalog. The owner can restore it.`}
        confirmLabel="Retire"
        destructive
        pending={retire.isPending}
        onCancel={() => setRetiring(false)}
        onConfirm={() => {
          retire.mutate(undefined, {
            onSuccess: () => {
              toast.success("Voucher retired");
              setRetiring(false);
              onClose();
            },
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />
    </Sheet>
  );
}

function useRetireVoucher(address: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clcApi.market.retireVoucher(address),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}
