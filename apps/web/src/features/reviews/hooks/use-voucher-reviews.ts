import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  flagReview,
  getReviewAccess,
  getReviews,
  saveReview,
  saveReviewReply,
} from "../api/reviews-client";

function publicReviewsQuery(address: string, stars?: number) {
  const key = ["voucher-reviews", address.toLowerCase()] as const;
  return {
    queryKey: [...key, "public", stars] as const,
    queryFn: ({ pageParam, signal }: { pageParam: number | undefined; signal: AbortSignal }) =>
      getReviews(address, stars, pageParam, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page: Awaited<ReturnType<typeof getReviews>>) => page.next ?? undefined,
  };
}

/** The header and full panel share this exact public cache entry. */
export function useVoucherReviewSummary(address: string) {
  const reviews = useInfiniteQuery(publicReviewsQuery(address));
  return { ...reviews, summary: reviews.data?.pages[0] };
}

export function useReviewAccess(address: string, poll = false) {
  const auth = useAuthStatus();
  const key = ["voucher-reviews", address.toLowerCase()] as const;
  const access = useQuery({
    queryKey: [...key, "access", auth.address?.toLowerCase(), auth.isAuthenticated],
    queryFn: ({ signal }) => getReviewAccess(address, signal),
    enabled: auth.isAuthenticated,
    staleTime: 0,
    refetchInterval: poll ? 3000 : 30000,
  });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!access.data?.editableUntil) return;
    const delay = Date.parse(access.data.editableUntil) - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => tick((value) => value + 1), Math.min(delay, 2147483647));
    return () => clearTimeout(timer);
  }, [access.data?.editableUntil]);
  return { auth, access };
}

export function useVoucherReviews(address: string, stars?: number) {
  const client = useQueryClient();
  const key = ["voucher-reviews", address.toLowerCase()] as const;
  const { auth, access } = useReviewAccess(address);
  const reviews = useInfiniteQuery(publicReviewsQuery(address, stars));
  const mutation = useMutation({
    mutationFn: (
      action:
        | { kind: "review"; stars: number; text: string }
        | { kind: "reply" | "flag"; id: number; text: string },
    ) => {
      if (action.kind === "review") return saveReview(address, action.stars, action.text);
      if (action.kind === "reply") return saveReviewReply(address, action.id, action.text);
      return flagReview(address, action.id, action.text);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  return { auth, access, reviews, mutation };
}
