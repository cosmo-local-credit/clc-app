import type { SafeProposal } from "@clc/api/features/safe/client";
import { safeKeys } from "@clc/api/features/safe/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { safeClient } from "#/lib/api/safe";

/**
 * Requests clc-core's sponsored execution for a threshold-approved Safe
 * proposal. The endpoint is idempotent for queued/submitted work and retries a
 * finalized failed job, so every Safe surface can share this fallback.
 */
export function useSafeExecute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposal: SafeProposal) =>
      safeClient.execute(proposal.safeTxHash as `0x${string}`),
    onSuccess: (_updated, proposal) =>
      queryClient.invalidateQueries({ queryKey: safeKeys.pending(proposal.safe) }),
  });
}
