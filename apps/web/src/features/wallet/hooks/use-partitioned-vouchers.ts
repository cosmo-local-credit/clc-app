import { BackendApiError } from "@clc/api/client/errors";
import { voucherQueryOptions } from "@clc/api/features/market/queries";
import { useQueries } from "@tanstack/react-query";

import { marketClient } from "#/lib/api/market";
import {
  catalogOwnerFromDetail,
  partitionTokensByIssuer,
} from "../logic/partition-tokens-by-issuer";

/**
 * A balance row does not say who issued the token. The catalog detail does,
 * including vouchers the map list drops because they have no coordinates, and
 * the voucher page already caches that read under the same key.
 *
 * A miss is not retried: the token is not a catalog voucher, and a second
 * request answers the same way. Anything else retries once, matching the app
 * default.
 */
function retryVoucherOwner(failureCount: number, error: unknown): boolean {
  if (error instanceof BackendApiError && error.kind === "not-found") return false;
  return failureCount < 1;
}

export function usePartitionedVouchers<T extends { id: string }>(
  tokens: readonly T[],
  viewer: string | undefined,
) {
  return useQueries({
    queries: tokens.map((token) => ({
      ...voucherQueryOptions(marketClient, token.id),
      retry: retryVoucherOwner,
    })),
    combine: (results) => {
      const owners = new Map(
        results.flatMap((result, index) => {
          const token = tokens[index];
          return token ? [[token.id.toLowerCase(), catalogOwnerFromDetail(result)] as const] : [];
        }),
      );
      return {
        ...partitionTokensByIssuer(tokens, owners, viewer),
        // Only the failed reads: the rest are cached and still right.
        refetch: () =>
          Promise.all(results.filter((result) => result.isError).map((result) => result.refetch())),
        isFetching: results.some((result) => result.isFetching),
      };
    },
  });
}
