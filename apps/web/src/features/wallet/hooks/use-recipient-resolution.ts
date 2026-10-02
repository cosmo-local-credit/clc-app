import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  recipientKeys,
  recipientReverseQueryOptions,
  recipientSearchQueryOptions,
} from "@clc/api/features/recipients/queries";

import { resolvePhoneRecipient } from "#/features/wallet/api/recipient-resolution-client";
import { recipientsClient } from "#/lib/api/recipients";

export function usePhoneRecipientResolution(phone: string | null) {
  return useQuery({
    queryKey: recipientKeys.phone(phone ?? "none"),
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
    ...recipientSearchQueryOptions(
      recipientsClient,
      debounced ?? "none",
      allowPools ? undefined : "user",
    ),
    enabled: Boolean(debounced) && debounced === query,
  });
  return {
    ...results,
    data: debounced === query ? results.data : undefined,
    isDebouncing: debounced !== query,
  };
}

export function useReverseRecipientResolution(address: string | null) {
  return useQuery({
    ...recipientReverseQueryOptions(recipientsClient, address ?? "none"),
    enabled: Boolean(address),
  });
}
