import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { retirementKeys } from "@clc/api/features/retirement/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { retirementClient } from "#/lib/api/retirement";

/** A request does not retire the resource: keep its details and balances cached. */
export function useRequestRetirement(type: RetirementResourceType, address: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      retirementClient.create(type, address, { reason: reason.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: retirementKeys.all }),
  });
}

export function useCancelRetirementRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => retirementClient.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: retirementKeys.all }),
  });
}
