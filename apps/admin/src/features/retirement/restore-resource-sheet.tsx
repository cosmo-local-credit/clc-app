import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { errorMessage } from "#/lib/data-state";
import { useRestoreResource } from "./use-retirement";

export function RestoreResourceSheet({
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
          <SheetTitle>Restore {type}</SheetTitle>
          <SheetDescription>{name}</SheetDescription>
        </SheetHeader>
        {open ? <RestoreForm type={type} address={address} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function RestoreForm({
  type,
  address,
  onClose,
}: {
  type: RetirementResourceType;
  address: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const restore = useRestoreResource(type, address);
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim() || restore.isPending) return;
        restore.mutate(reason.trim(), { onSuccess: onClose });
      }}
    >
      <div className="space-y-4 p-4 text-sm">
        <p>
          Restoration returns this {type} to CLC. Its retained records and settings are kept. The
          blockchain contract and balances do not change.
        </p>
        <p className="text-muted-foreground">
          Resource allowances must permit restoration. If an allowance is full, adjust it before
          trying again.
        </p>
        <div className="space-y-2">
          <label htmlFor="restore-reason" className="font-medium">
            Reason for restoration
          </label>
          <Textarea
            id="restore-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            required
            disabled={restore.isPending}
          />
        </div>
        {restore.isError ? (
          <p role="alert" className="text-destructive">
            {errorMessage(restore.error)}
          </p>
        ) : null}
      </div>
      <SheetFooter className="border-border flex-row justify-end border-t">
        <Button type="button" variant="outline" disabled={restore.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!reason.trim() || restore.isPending}>
          {restore.isPending ? "Restoring…" : `Restore ${type}`}
        </Button>
      </SheetFooter>
    </form>
  );
}
