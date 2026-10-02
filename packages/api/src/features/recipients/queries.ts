import { queryOptions } from "@tanstack/react-query";
import { BackendApiError } from "../../client/errors";
import type { RecipientIdentity } from "./client";
import type { createRecipientsClient } from "./client";

type RecipientsClient = ReturnType<typeof createRecipientsClient>;
type RecipientKind = RecipientIdentity["kind"];

export const recipientKeys = {
  all: ["clc", "recipients"] as const,
  phone: (phone: string) => [...recipientKeys.all, "phone", phone] as const,
  search: (query: string, kind?: RecipientKind) =>
    [...recipientKeys.all, "search", query, kind ?? "all"] as const,
  reverse: (address: string) => [...recipientKeys.all, "reverse", address.toLowerCase()] as const,
} as const;

export function recipientSearchQueryOptions(
  recipients: RecipientsClient,
  query: string,
  kind?: RecipientKind,
) {
  return queryOptions({
    queryKey: recipientKeys.search(query, kind),
    queryFn: ({ signal }) => recipients.search(query, kind, signal),
    staleTime: 0,
  });
}

export function recipientReverseQueryOptions(recipients: RecipientsClient, address: string) {
  return queryOptions({
    queryKey: recipientKeys.reverse(address),
    queryFn: async ({ signal }) => {
      try {
        return await recipients.reverse(address, signal);
      } catch (error) {
        if (error instanceof BackendApiError && error.status === 404) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}
