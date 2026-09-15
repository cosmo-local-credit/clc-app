import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import type { AddressBookEntry } from "#/features/wallet/api/address-book-storage";
import {
  useAddressBookEntries,
  useRemoveAddressBookEntry,
  useRenameAddressBookEntry,
} from "#/features/wallet/hooks/use-address-book";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";
import { AddressBookEntryRow } from "./address-book-entry-row";

export function AddressBookSheet({
  open,
  onOpenChange,
  onSelect,
  owner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: AddressBookEntry) => void;
  /** Whose address book to show. Null while the session is still resolving. */
  owner: StorageOwner | null;
}) {
  const { t } = useLingui();
  const entriesQuery = useAddressBookEntries(owner);
  const renameEntry = useRenameAddressBookEntry(owner);
  const removeEntry = useRemoveAddressBookEntry(owner);
  // One row at a time: an open editor on a row the user has scrolled past is a
  // draft nickname they cannot see themselves about to save.
  const [editingId, setEditingId] = useState<string | null>(null);
  const entries = entriesQuery.data ?? [];

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Address book</Trans>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3">
            {entriesQuery.isPending ? (
              <p className="px-3 py-4 text-muted-foreground text-sm">
                <Trans>Loading address book…</Trans>
              </p>
            ) : null}
            {entriesQuery.isSuccess && entries.length === 0 ? (
              <p className="px-3 py-4 text-muted-foreground text-sm">
                <Trans>No saved recipients yet.</Trans>
              </p>
            ) : null}
            {entries.map((entry, index, list) => (
              <div
                key={entry.id}
                className={cn(index < list.length - 1 && "border-b border-border")}
              >
                <AddressBookEntryRow
                  entry={entry}
                  editing={editingId === entry.id}
                  onSelect={() => {
                    onSelect(entry);
                    onOpenChange(false);
                  }}
                  onStartEditing={() => setEditingId(entry.id)}
                  onCancelEditing={() => setEditingId(null)}
                  onRename={(nickname) => {
                    renameEntry.mutate({ id: entry.id, nickname });
                    setEditingId(null);
                  }}
                  onRemove={() => {
                    removeEntry.mutate({ id: entry.id });
                    setEditingId(null);
                  }}
                />
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button variant="ghost" className="h-11 w-full" onClick={() => onOpenChange(false)}>
              {t`Cancel`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
