import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BackendApiError } from "@clc/api/client/errors";

import { resolvePhoneRecipient } from "#/features/wallet/api/recipient-resolution-client";
import { recipientsClient, recipientQueryKey } from "#/lib/api/recipients";

export function usePhoneRecipientResolution(phone: string | null) {
  return useQuery({
    queryKey: [...recipientQueryKey, "phone", phone],
    queryFn: () => resolvePhoneRecipient(phone!),
    enabled: Boolean(phone),
  });
}

export function useRecipientSearch(query: string | null, allowPools: boolean) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: [...recipientQueryKey, "search", debounced, allowPools],
    queryFn: ({ signal }) =>
      recipientsClient.search(debounced!, allowPools ? undefined : "user", signal),
    enabled: Boolean(debounced) && debounced === query,
    staleTime: 0,
  });
  return {
    ...results,
    data: debounced === query ? results.data : undefined,
    isDebouncing: debounced !== query,
  };
}

export function useReverseRecipientResolution(address: string | null) {
  return useQuery({
    queryKey: [...recipientQueryKey, "reverse", address?.toLowerCase()],
    queryFn: async ({ signal }) => {
      try {
        return await recipientsClient.reverse(address!, signal);
      } catch (error) {
        if (error instanceof BackendApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(address),
    retry: false,
    staleTime: 0,
  });
}
