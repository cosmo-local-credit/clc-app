import { voucherWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import { useInfiniteQuery } from "@tanstack/react-query";
import { wantsClient } from "#/lib/api/wants";

export function useVoucherWants(address: string) {
  const query = useInfiniteQuery(voucherWantsInfiniteQueryOptions(wantsClient, address));
  const wants = query.data?.pages.flatMap((page) => page.wants) ?? [];
  return { query, wants };
}
