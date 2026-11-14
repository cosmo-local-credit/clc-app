import { queryOptions } from "@tanstack/react-query";
import type { OracleFeedsClient } from "./client";

export const oracleFeedKeys = {
  all: ["clc", "oracle-feeds"] as const,
  list: (chainId: number) => ["clc", "oracle-feeds", chainId] as const,
} as const;

export function oracleFeedsQueryOptions(client: OracleFeedsClient, chainId: number) {
  return queryOptions({
    queryKey: oracleFeedKeys.list(chainId),
    queryFn: ({ signal }) => client.listOracleFeeds(chainId, signal),
    staleTime: 5 * 60_000,
  });
}
