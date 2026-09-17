import {
  patchVoucherOfferingCaches,
  removeVoucherOfferingFromCaches,
} from "@clc/api/features/offerings/cache";
import type { Offering, OfferingWrite } from "@clc/api/features/offerings/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { poolKeys } from "@clc/api/features/pools/queries";
import { vocabularyKeys } from "@clc/api/features/vocabulary/queries";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

import { offeringsClient } from "#/lib/api/offerings";

/**
 * What every offering write does to the cache, once the server has accepted it.
 *
 * The patch is authoritative and this deliberately does not invalidate the
 * voucher's own offering queries afterwards. The public list answers
 * `public, max-age=60, stale-while-revalidate=300`, so a refetch triggered here
 * can be served the pre-mutation body from the browser's HTTP cache — an owner
 * would unlist a row and watch it return. Only the write's own response is
 * certainly current.
 *
 * Pools and vouchers are invalidated because this write really did change them
 * and they cannot be patched from here: a pool composes its offerings from the
 * vouchers it allows, and the market marker is derived in clc-core from the rows
 * that just moved. Neither read carries a browser `max-age` that could answer
 * stale — the pool route is `no-store` — so invalidation is the right tool there.
 */
function settleOfferingWrite(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: poolKeys.all }),
    queryClient.invalidateQueries({ queryKey: voucherKeys.all }),
    queryClient.invalidateQueries({ queryKey: vocabularyKeys.offeringUnits() }),
  ]);
}

export function useCreateVoucherOffering(voucherAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OfferingWrite) =>
      offeringsClient.createVoucherOffering(voucherAddress, input),
    onSuccess: (offering: Offering) => {
      patchVoucherOfferingCaches(queryClient, voucherAddress, offering);
      return settleOfferingWrite(queryClient);
    },
  });
}

export function useUpdateVoucherOffering(voucherAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OfferingWrite }) =>
      offeringsClient.updateVoucherOffering(voucherAddress, id, input),
    onSuccess: (offering: Offering) => {
      patchVoucherOfferingCaches(queryClient, voucherAddress, offering);
      return settleOfferingWrite(queryClient);
    },
  });
}

export function useDeleteVoucherOffering(voucherAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => offeringsClient.deleteVoucherOffering(voucherAddress, id),
    onSuccess: (id: string) => {
      removeVoucherOfferingFromCaches(queryClient, voucherAddress, id);
      return settleOfferingWrite(queryClient);
    },
  });
}
