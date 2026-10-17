import { Trans, useLingui } from "@lingui/react/macro";

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
import { type Recipient } from "#/components/wallet/wallet-data";
import { useAddressBookRecipients } from "#/features/wallet/hooks/use-address-book";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";
import { RecentRecipientRow } from "./recent-recipient-row";

export function AddressBookSheet({
  open,
  onOpenChange,
  onSelect,
  owner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (recipient: Recipient) => void;
  /** Whose address book to show. Null while the session is still resolving. */
  owner: StorageOwner | null;
}) {
  const { t } = useLingui();
  const recipientsQuery = useAddressBookRecipients(owner);
  const recipients = recipientsQuery.data ?? [];

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Address book</Trans>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3">
            {recipientsQuery.isPending ? (
              <p className="px-3 py-4 text-muted-foreground text-sm">
                <Trans>Loading address book…</Trans>
              </p>
            ) : null}
            {recipientsQuery.isSuccess && recipients.length === 0 ? (
              <p className="px-3 py-4 text-muted-foreground text-sm">
                <Trans>No saved recipients yet.</Trans>
              </p>
            ) : null}
            {recipients.map((recipient, index, list) => (
              <div
                key={recipient.id}
                className={cn(index < list.length - 1 && "border-b border-border")}
              >
                <RecentRecipientRow
                  recipient={recipient}
                  onSelect={() => {
                    onSelect(recipient);
                    onOpenChange(false);
                  }}
                />
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button variant="ghost" tap className="w-full" onClick={() => onOpenChange(false)}>
              {t`Cancel`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}
