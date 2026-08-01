import { useQuery } from "@tanstack/react-query";

import {
  resolveEnsRecipient,
  resolvePhoneRecipient,
  reverseResolveAddress,
} from "#/features/wallet/api/recipient-resolution-client";

const recipientResolutionQueryKeys = {
  all: ["recipient-resolution"] as const,
  phone: (phone: string) => [...recipientResolutionQueryKeys.all, "phone", phone] as const,
  ens: (ensName: string) => [...recipientResolutionQueryKeys.all, "ens", ensName] as const,
  reverseEns: (address: string) =>
    [...recipientResolutionQueryKeys.all, "reverse-ens", address.toLowerCase()] as const,
};

export function usePhoneRecipientResolution(phone: string | null) {
  return useQuery({
    queryKey: recipientResolutionQueryKeys.phone(phone ?? "none"),
    queryFn: () => resolvePhoneRecipient(requireQueryValue(phone, "phone")),
    enabled: Boolean(phone),
  });
}

export function useEnsRecipientResolution(ensName: string | null) {
  return useQuery({
    queryKey: recipientResolutionQueryKeys.ens(ensName?.toLowerCase() ?? "none"),
    queryFn: () => resolveEnsRecipient(requireQueryValue(ensName, "ENS name")),
    enabled: Boolean(ensName),
  });
}

export function useReverseEnsResolution(address: string | null) {
  return useQuery({
    queryKey: recipientResolutionQueryKeys.reverseEns(address ?? "none"),
    queryFn: () => reverseResolveAddress(requireQueryValue(address, "address")),
    enabled: Boolean(address),
  });
}

function requireQueryValue(value: string | null, label: string): string {
  if (!value) throw new Error(`Recipient ${label} is required.`);
  return value;
}
