import type { AccountRetirementPreview } from "@clc/core/features/account-retirement/logic";
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
import { errorMessage } from "#/lib/data-state";
import { formatDate } from "#/lib/format";
import { useAccountRetirement, useRetireAccount } from "../use-account-retirement";

/**
 * Retire an account, after reading what the server says it would hide and leave.
 *
 * The preview is the server's, not a client estimate: the counts and the notes
 * about balances and in-flight operations are what clc-core would act on, so the
 * button is held back until they have loaded.
 */
export function RetireAccountSheet({
  address,
  name,
  open,
  onClose,
}: {
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
          <SheetTitle>Retire account</SheetTitle>
          <SheetDescription>{name}</SheetDescription>
        </SheetHeader>
        {open ? <RetireForm address={address} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function RetireForm({ address, onClose }: { address: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const retirement = useAccountRetirement(address);
  const retire = useRetireAccount();

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!retirement.data || retire.isPending) return;
        retire.mutate(
          { address, reason },
          {
            onSuccess: () => {
              toast.success("Account retired.");
              onClose();
            },
          },
        );
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        {retirement.isPending ? <p role="status">Loading what retirement would change…</p> : null}
        {retirement.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-destructive">{errorMessage(retirement.error)}</p>
            <Button type="button" variant="outline" onClick={() => void retirement.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {retirement.data ? <AccountPreview preview={retirement.data.preview} /> : null}
        <ReasonField
          id="retire-account-reason"
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
        <Button type="submit" variant="destructive" disabled={!retirement.data || retire.isPending}>
          {retire.isPending ? "Retiring…" : "Retire account"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function AccountPreview({ preview }: { preview: AccountRetirementPreview }) {
  const stays = preview.ownedResources.filter((resource) => resource.active);
  const hidden = [
    ["Wants", preview.hiddenContent.wants],
    ["Catalogs", preview.hiddenContent.catalogs],
    ["Posts", preview.hiddenContent.posts],
    ["Reviews", preview.hiddenContent.reviews],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <p>
        The account closes on <span className="font-data">{formatDate(preview.closesAt)}</span> (
        {preview.recoveryMonths} months). It can be restored until then.
      </p>

      <section className="border-border flex flex-col gap-2 border p-3">
        <h3 className="font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground">
          Hidden while retired
        </h3>
        <dl className="grid grid-cols-4 gap-2">
          {hidden.map(([label, count]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-data font-semibold">{count}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-border flex flex-col gap-2 border p-3">
        <h3 className="font-mono text-xs tracking-[0.14em] uppercase text-muted-foreground">
          Stays active
        </h3>
        {stays.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {stays.map((resource) => (
              <li key={resource.address} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">{resource.name || resource.address}</span>
                <span className="text-muted-foreground font-mono text-xs uppercase">
                  {resource.resourceType}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No active vouchers or pools.</p>
        )}
        <p>
          Pending resource requests:{" "}
          <span className="font-data font-semibold">{preview.pendingResourceRequests}</span>
        </p>
      </section>

      <p className="text-muted-foreground">{preview.balancesCoverageNote}</p>
      <p className="text-muted-foreground">{preview.pendingOperationsNote}</p>
    </div>
  );
}
