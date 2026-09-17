import {
  patchVoucherOfferingCaches,
  removeVoucherOfferingFromCaches,
} from "@clc/api/features/offerings/cache";
import type { Offering, OfferingWrite } from "@clc/api/features/offerings/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * What every offering write does to the cache once the server has accepted it.
 *
 * The patch is authoritative and there is deliberately no invalidation of this
 * voucher's own offering queries afterwards. The public list answers
 * `public, max-age=60, stale-while-revalidate=300`, so a refetch triggered here
 * can be served the pre-mutation body out of the browser's HTTP cache — the row
 * would reappear seconds after being unlisted. The write's own response is the
 * only body that is certainly current, so it is what the cache is built from.
 *
 * The two invalidations that do run are for caches this write genuinely changed
 * and cannot patch:
 *
 *   * pools, because a pool's offerings are composed from the vouchers it allows,
 *     and this voucher may be in several;
 *   * vouchers, because the market marker and the offering-derived facets are
 *     computed in clc-core from the rows that just changed.
 *
 * Neither is cached with a browser `max-age` that could answer them stale — the
 * pool route is `no-store` and the console's whole catalog client is — so
 * invalidation is the right tool there and patching would mean reimplementing
 * clc-core's kind derivation on the client.
 */
function settleOfferingWrite(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: poolKeys.all }),
    queryClient.invalidateQueries({ queryKey: voucherKeys.all }),
    queryClient.invalidateQueries({ queryKey: vocabularyKeys.offeringUnits() }),
  ]);
}

/**
 * Publishes an offering for a voucher.
 *
 * No optimistic update. The server decides whether this operator may write at all
 * — the authorization is a locked read of the voucher's owner — so showing the row
 * before it answers would show a listing that may not exist.
 */
export function useCreateVoucherOffering(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OfferingWrite) => clcApi.offerings.createVoucherOffering(address, input),
    onSuccess: (offering: Offering) => {
      patchVoucherOfferingCaches(queryClient, address, offering);
      return settleOfferingWrite(queryClient);
    },
  });
}

export function useUpdateVoucherOffering(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OfferingWrite }) =>
      clcApi.offerings.updateVoucherOffering(address, id, input),
    onSuccess: (offering: Offering) => {
      patchVoucherOfferingCaches(queryClient, address, offering);
      return settleOfferingWrite(queryClient);
    },
  });
}

/**
 * Unlists an offering.
 *
 * The id comes back from the server rather than being taken from the argument, so
 * the cache is edited using what was actually unlisted.
 */
export function useDeleteVoucherOffering(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clcApi.offerings.deleteVoucherOffering(address, id),
    onSuccess: (id: string) => {
      removeVoucherOfferingFromCaches(queryClient, address, id);
      return settleOfferingWrite(queryClient);
    },
  });
}
