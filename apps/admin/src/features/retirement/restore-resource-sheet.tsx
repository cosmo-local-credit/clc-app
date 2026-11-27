import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { isVoucherDisplaySymbolConflict } from "@clc/api/features/symbols/client";
import { parseVoucherDisplaySymbol } from "@clc/core/lib/symbol";
import { useState } from "react";
import { VoucherDisplaySymbolField } from "#/components/admin/voucher-display-symbol-field";
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
  displaySymbol,
  open,
  onClose,
}: {
  type: RetirementResourceType;
  address: string;
  name: string;
  displaySymbol?: string | null;
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
        {open ? (
          <RestoreForm
            type={type}
            address={address}
            displaySymbol={displaySymbol}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function RestoreForm({
  type,
  address,
  displaySymbol,
  onClose,
}: {
  type: RetirementResourceType;
  address: string;
  displaySymbol?: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [symbol, setSymbol] = useState(displaySymbol ?? "");
  const [symbolError, setSymbolError] = useState<string>();
  const restore = useRestoreResource(type, address);
  const showSymbol = type === "voucher" && displaySymbol !== undefined;
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim() || restore.isPending) return;
        const needsSymbol = showSymbol && (displaySymbol === null || symbol !== displaySymbol);
        const replacement = needsSymbol ? parseVoucherDisplaySymbol(symbol) : null;
        if (needsSymbol && !replacement) {
          setSymbolError("Use 3–6 letters or digits.");
          return;
        }
        restore.mutate(
          {
            reason: reason.trim(),
            ...(replacement && replacement !== displaySymbol ? { displaySymbol: replacement } : {}),
          },
          {
            onSuccess: onClose,
            onError: (error) => {
              if (isVoucherDisplaySymbolConflict(error)) {
                setSymbolError("That symbol is already in use.");
              }
            },
          },
        );
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
        {showSymbol ? (
          <VoucherDisplaySymbolField
            value={symbol}
            error={symbolError}
            disabled={restore.isPending}
            onChange={(value) => {
              setSymbol(value);
              setSymbolError(undefined);
            }}
          />
        ) : null}
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
        {restore.isError && !isVoucherDisplaySymbolConflict(restore.error) ? (
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
