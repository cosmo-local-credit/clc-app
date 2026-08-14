import { useQuery } from "@tanstack/react-query";

import { getSendShare } from "#/features/wallet/api/send-share-client";

const sendShareQueryKeys = {
  all: ["wallet", "send-share"] as const,
  detail: (txHash: string | null) =>
    [...sendShareQueryKeys.all, "detail", txHash?.toLowerCase() ?? "none"] as const,
};

export function useSendShare(txHash: string | null, enabled = true) {
  return useQuery({
    queryKey: sendShareQueryKeys.detail(txHash),
    queryFn: () => getSendShare(txHash as string),
    enabled: enabled && !!txHash,
    staleTime: 60_000,
    retry: false,
  });
}
