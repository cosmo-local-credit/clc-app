import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  recipientReverseQueryOptions,
  recipientSearchQueryOptions,
} from "@clc/api/features/recipients/queries";

import { recipientsClient } from "#/lib/api/recipients";

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
    error: debounced === query ? results.error : null,
    isDebouncing: debounced !== query,
  };
}

export function useReverseRecipientResolution(address: string | null) {
  return useQuery({
    ...recipientReverseQueryOptions(recipientsClient, address ?? "none"),
    enabled: Boolean(address),
  });
}
