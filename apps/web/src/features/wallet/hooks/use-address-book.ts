import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readAddressBookRecipients,
  upsertAddressBookRecipient,
  type UpsertAddressBookRecipientInput,
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
  recipients: (owner: StorageOwner) => [...addressBookQueryKeys.all, owner, "recipients"] as const,
};

export function useAddressBookRecipients(owner: StorageOwner | null) {
  return useQuery({
    queryKey: addressBookQueryKeys.recipients(owner ?? "unresolved"),
    queryFn: () => readAddressBookRecipients(owner as StorageOwner),
    // A null owner means the session is still being decided. Reading the wrong
    // tier would show one person's contacts under another's session.
    enabled: owner !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useUpsertAddressBookRecipient(owner: StorageOwner | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertAddressBookRecipientInput) => {
      // Writing under an undecided owner would file this recipient in the guest
      // tier and leave it there after the session resolves. Dropping the save is
      // recoverable; misfiling it is not.
      if (owner === null) return null;
      return upsertAddressBookRecipient(owner, input);
    },
    onSuccess: () => {
      if (owner === null) return;
      void queryClient.invalidateQueries({ queryKey: addressBookQueryKeys.recipients(owner) });
    },
  });
}
