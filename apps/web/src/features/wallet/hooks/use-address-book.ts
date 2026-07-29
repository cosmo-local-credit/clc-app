import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readAddressBookRecipients,
  upsertAddressBookRecipient,
  type UpsertAddressBookRecipientInput,
} from "#/features/wallet/api/address-book-storage";

const addressBookQueryKeys = {
  all: ["address-book"] as const,
  recipients: () => [...addressBookQueryKeys.all, "recipients"] as const,
};

export function useAddressBookRecipients() {
  return useQuery({
    queryKey: addressBookQueryKeys.recipients(),
    queryFn: readAddressBookRecipients,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useUpsertAddressBookRecipient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertAddressBookRecipientInput) => upsertAddressBookRecipient(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: addressBookQueryKeys.recipients() });
    },
  });
}
