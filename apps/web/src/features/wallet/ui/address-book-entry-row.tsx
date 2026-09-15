import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import {
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiPencilLine,
} from "react-icons/ri";

import { EllipsizedAddress } from "#/components/wallet";
import { Input } from "#/components/ui/input";
import {
  addressBookEntryName,
  type AddressBookEntry,
} from "#/features/wallet/api/address-book-storage";

/**
 * One saved contact: its name, the resolved name underneath when a nickname has
 * replaced it on the first line, and the address.
 *
 * Not a single `<button>` any more. The row carries its own edit and delete
 * controls, and a button cannot nest inside a button — so the tap target is one
 * child of a flex row and the controls are its siblings.
 */
export function AddressBookEntryRow({
  entry,
  editing,
  onSelect,
  onStartEditing,
  onCancelEditing,
  onRename,
  onRemove,
}: {
  entry: AddressBookEntry;
  editing: boolean;
  onSelect: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onRename: (nickname: string | null) => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const name = addressBookEntryName(entry);
  // The resolved name is worth a second line only when the nickname has taken
  // the first — otherwise it would print twice.
  const resolvedSubtitle = entry.nickname ? (entry.ensName ?? entry.phone) : null;

  if (editing) {
    return (
      <NicknameEditor
        entry={entry}
        onCancel={onCancelEditing}
        onRename={onRename}
        onRemove={onRemove}
      />
    );
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="break-all font-medium text-sm">{name ?? t`Address`}</p>
          {resolvedSubtitle ? (
            <p className="mt-0.5 break-all text-muted-foreground text-xs">{resolvedSubtitle}</p>
          ) : null}
          <div className="mt-1 min-w-0 break-all">
            <EllipsizedAddress address={entry.address} />
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onStartEditing}
        aria-label={t`Edit ${name ?? entry.address}`}
        className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
      >
        <RiPencilLine className="size-4" aria-hidden="true" />
      </button>
      <RiArrowRightSLine
        className="mr-2 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

function NicknameEditor({
  entry,
  onCancel,
  onRename,
  onRemove,
}: {
  entry: AddressBookEntry;
  onCancel: () => void;
  onRename: (nickname: string | null) => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(entry.nickname ?? "");

  function submit() {
    // An emptied field clears the nickname rather than storing "", so the name
    // falls back to whatever the resolver answered instead of to the address.
    const trimmed = draft.trim();
    onRename(trimmed.length > 0 ? trimmed : null);
  }

  return (
    <div className="p-3">
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t`Nickname`}
          placeholder={t`Nickname`}
          className="bg-card text-sm"
        />
        <button
          type="submit"
          aria-label={t`Save nickname`}
          className="flex size-11 shrink-0 items-center justify-center text-primary"
        >
          <RiCheckLine className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t`Cancel rename`}
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiCloseLine className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t`Remove contact`}
          className="flex size-11 shrink-0 items-center justify-center text-destructive"
        >
          <RiDeleteBinLine className="size-4" aria-hidden="true" />
        </button>
      </form>
      {entry.ensName ? (
        <p className="mt-2 break-all text-muted-foreground text-xs">{entry.ensName}</p>
      ) : null}
      <div className="mt-1 min-w-0 break-all">
        <EllipsizedAddress address={entry.address} />
      </div>
    </div>
  );
}
