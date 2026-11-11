import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { retirementPreviewQueryOptions } from "@clc/api/features/retirement/queries";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ReasonField } from "#/components/admin/reason-field";
import { Button } from "#/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { BalanceAcknowledgement, BalanceCheck } from "./balance-check";
import { useRetireResource } from "./use-retirement";

/**
 * Retires a voucher or pool without waiting for its owner to ask.
 *
 * Balances are checked first, as they are when an owner's request is approved:
 * retirement leaves them where they are, so positive balances need an explicit
 * acknowledgement, tied to the block they were read at.
 */
export function RetireResourceSheet({
  type,
  address,
  name,
  open,
  onClose,
}: {
  type: RetirementResourceType;
  address: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Retire {type}</SheetTitle>
          <SheetDescription>{name}</SheetDescription>
        </SheetHeader>
        {open ? <RetireForm type={type} address={address} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function RetireForm({
  type,
  address,
  onClose,
}: {
  type: RetirementResourceType;
  address: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledgedBlock, setAcknowledgedBlock] = useState<string | null>(null);
  const preview = useQuery({
    ...retirementPreviewQueryOptions(clcApi.retirement, type, address, "admin"),
    refetchOnWindowFocus: "always",
  });
  const retire = useRetireResource(type, address);
  const current = preview.data;
  const acknowledged = !!current && acknowledgedBlock === current.blockNumber;
  const canRetire =
    !!current &&
    !preview.isFetching &&
    !preview.isError &&
    (!current.hasPositiveBalances || acknowledged);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canRetire || retire.isPending) return;
        retire.mutate(
          {
            acknowledgeBalances: acknowledged,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
          {
            onSuccess: ({ changed }) => {
              toast.success(
                changed ? `Retired this ${type}.` : `This ${type} was already retired.`,
              );
              onClose();
            },
            // The balances may have moved since they were read; the next
            // acknowledgement has to be of the refreshed figures.
            onError: () => {
              setAcknowledgedBlock(null);
              void preview.refetch();
            },
          },
        );
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        <BalanceCheck preview={preview} />
        {current && !current.active ? <p role="status">This {type} is already retired.</p> : null}
        {current?.hasPositiveBalances ? (
          <BalanceAcknowledgement
            current={current}
            acknowledgedBlock={acknowledgedBlock}
            disabled={retire.isPending || preview.isFetching || preview.isError}
            label="I understand that balances remain and retire this resource with these balances."
            onChange={setAcknowledgedBlock}
          />
        ) : null}
        <ReasonField
          id="retire-resource-reason"
          value={reason}
          onChange={setReason}
          disabled={retire.isPending}
        />
        {retire.isError ? (
          <p role="alert" className="text-destructive">
            {errorMessage(retire.error)}
          </p>
        ) : null}
      </div>
      <SheetFooter className="border-border flex-row justify-end border-t">
        <Button type="button" variant="outline" disabled={retire.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!canRetire || retire.isPending}>
          {retire.isPending ? "Retiring…" : `Retire ${type}`}
        </Button>
      </SheetFooter>
    </form>
  );
}
