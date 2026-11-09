import { invalidatePoolOfferings } from "@clc/api/features/offerings/cache";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Refreshes a pool's Offers when its voucher membership changes. Core can index
 * membership after the write-triggered refresh, so the completed voucher list
 * is the signal: only its set of addresses counts, not order, casing or
 * metadata. Both the phone and desktop pool pages call it.
 */
export function useRefreshPoolOfferingsOnMembership(
  poolAddress: string,
  /** The voucher list has fully loaded without error. */
  complete: boolean,
  vouchers: readonly { tokenAddress: string }[],
) {
  const queryClient = useQueryClient();
  const membership = complete
    ? vouchers
        .map((voucher) => voucher.tokenAddress.toLowerCase())
        .sort()
        .join(",")
    : undefined;
  useEffect(() => {
    if (membership === undefined) return;
    void invalidatePoolOfferings(queryClient, poolAddress);
  }, [poolAddress, queryClient, membership]);
}
