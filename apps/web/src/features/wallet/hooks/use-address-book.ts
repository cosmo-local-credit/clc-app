import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readAddressBookEntries,
  removeAddressBookEntry,
  renameAddressBookEntry,
  saveAddressBookEntry,
  type SaveAddressBookEntryInput,
} from "#/features/wallet/api/address-book-storage";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * Outside the `["clc", …]` namespace on purpose: that prefix belongs to
 * `@clc/api`'s backend reads, and this one is backed by `localStorage`. The
 * owner is part of the key so one account's list is never served to the next —
 * which is also what keeps `staleTime: Infinity` safe, since a different owner
 * is a different key rather than a stale entry.
 *
 * `features/auth/api/identity-reset.ts` sweeps this prefix alongside `["clc"]`.
 */
const addressBookQueryKeys = {
  all: ["address-book"] as const,
  entries: (owner: StorageOwner) => [...addressBookQueryKeys.all, owner, "entries"] as const,
};

export function useAddressBookEntries(owner: StorageOwner | null) {
  return useQuery({
    queryKey: addressBookQueryKeys.entries(owner ?? "unresolved"),
    queryFn: () => readAddressBookEntries(owner as StorageOwner),
    // A null owner means the session is still being decided. Reading the wrong
    // tier would show one person's contacts under another's session.
    enabled: owner !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSaveAddressBookEntry(owner: StorageOwner | null) {
  return useAddressBookMutation(owner, (resolvedOwner, input: SaveAddressBookEntryInput) =>
    saveAddressBookEntry(resolvedOwner, input),
  );
}

export function useRenameAddressBookEntry(owner: StorageOwner | null) {
  return useAddressBookMutation(
    owner,
    (resolvedOwner, input: { id: string; nickname: string | null }) => {
      renameAddressBookEntry(resolvedOwner, input.id, input.nickname);
      return null;
    },
  );
}

export function useRemoveAddressBookEntry(owner: StorageOwner | null) {
  return useAddressBookMutation(owner, (resolvedOwner, input: { id: string }) => {
    removeAddressBookEntry(resolvedOwner, input.id);
    return null;
  });
}

/**
 * The three writes share one shape, and the part worth sharing is the null-owner
 * branch: writing under an undecided owner would file the change in the guest
 * tier and leave it there after the session resolves. Dropping the write is
 * recoverable; misfiling it is not.
 */
function useAddressBookMutation<TInput, TResult>(
  owner: StorageOwner | null,
  write: (owner: StorageOwner, input: TInput) => TResult,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      if (owner === null) return null;
      return write(owner, input);
    },
    onSuccess: () => {
      if (owner === null) return;
      void queryClient.invalidateQueries({ queryKey: addressBookQueryKeys.entries(owner) });
    },
  });
}
