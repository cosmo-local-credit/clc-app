import { type MutationFilters, useIsMutating } from "@tanstack/react-query";

/**
 * Whether an owner action on this voucher is still running anywhere in the app.
 *
 * A form mounted after a layout switch gets a fresh mutation observer that
 * never saw the first submit, so its own `isPending` is false while the
 * signature or relay is still out. The mutation cache outlives both views.
 */
export function useVoucherActionInFlight(
  filters: Pick<MutationFilters, "mutationKey" | "predicate">,
  tokenAddress: string | undefined,
) {
  return (
    useIsMutating({
      mutationKey: filters.mutationKey,
      predicate: (mutation) =>
        tokenAddress !== undefined &&
        (mutation.state.variables as { tokenAddress?: string } | undefined)?.tokenAddress ===
          tokenAddress &&
        (filters.predicate?.(mutation) ?? true),
    }) > 0
  );
}
