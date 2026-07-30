import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  type RecipientSearchInput,
  searchRecipientUsers,
} from "#/features/wallet/api/recipient-resolution-client";

const RECIPIENT_SEARCH_DEBOUNCE_MS = 250;

export const recipientResolutionQueryKeys = {
  all: ["recipient-resolution"] as const,
  search: (input: RecipientSearchInput | null) =>
    [
      ...recipientResolutionQueryKeys.all,
      "search",
      input?.kind ?? "none",
      input?.query ?? "",
    ] as const,
};

export function useRecipientSearch(input: RecipientSearchInput | null) {
  const [debouncedInput, setDebouncedInput] = useState<RecipientSearchInput | null>(null);

  useEffect(() => {
    if (!input) {
      setDebouncedInput(null);
      return;
    }

    const timeout = window.setTimeout(() => setDebouncedInput(input), RECIPIENT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [input?.kind, input?.query]);

  const activeInput =
    input && debouncedInput?.kind === input.kind && debouncedInput.query === input.query
      ? debouncedInput
      : null;
  const query = useQuery({
    queryKey: recipientResolutionQueryKeys.search(debouncedInput),
    queryFn: () => searchRecipientUsers(requireSearchInput(activeInput)),
    enabled: Boolean(activeInput),
  });

  return {
    data: activeInput ? query.data : undefined,
    error: activeInput ? query.error : null,
    isPending: Boolean(activeInput) && query.isPending,
    isDebouncing: Boolean(input) && !activeInput,
  };
}

function requireSearchInput(input: RecipientSearchInput | null): RecipientSearchInput {
  if (!input) throw new Error("Recipient search input is required.");
  return input;
}
