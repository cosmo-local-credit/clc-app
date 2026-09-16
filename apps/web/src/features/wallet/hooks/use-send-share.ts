import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSendShare,
  type CreateSendShareInput,
  getSendShare,
  getSendShareEligibility,
} from "#/features/wallet/api/send-share-client";

const sendShareQueryKeys = {
  all: ["wallet", "send-share"] as const,
  eligibility: (address: string | null) =>
    [...sendShareQueryKeys.all, "eligibility", address?.toLowerCase() ?? "none"] as const,
  detail: (txHash: string | null) =>
    [...sendShareQueryKeys.all, "detail", txHash?.toLowerCase() ?? "none"] as const,
};

export function useSendShareEligibility(address: string | null) {
  return useQuery({
    queryKey: sendShareQueryKeys.eligibility(address),
    queryFn: () => getSendShareEligibility(address as string),
    enabled: !!address,
    staleTime: 60_000,
    retry: false,
  });
}

export function useCreateSendShare(txHash: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSendShareInput) => createSendShare(txHash, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: sendShareQueryKeys.detail(txHash),
        exact: true,
      }),
  });
}

export function useSendShare(txHash: string | null, enabled = true) {
  return useQuery({
    queryKey: sendShareQueryKeys.detail(txHash),
    queryFn: () => getSendShare(txHash as string),
    enabled: enabled && !!txHash,
    staleTime: 60_000,
    retry: false,
  });
}
