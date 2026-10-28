import {
  reviewAccessQueryOptions,
  reviewKeys,
  reviewsInfiniteQueryOptions,
} from "@clc/api/features/reviews/queries";
import type { ReviewTarget } from "@clc/core/features/reviews/logic";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { reviewsClient } from "#/lib/api/reviews";

/** The header and full panel share this exact public cache entry. */
export function useReviewSummary(target: ReviewTarget) {
  const reviews = useInfiniteQuery(reviewsInfiniteQueryOptions(reviewsClient, target));
  return { ...reviews, summary: reviews.data?.pages[0] };
}

export function useResourceReviewAccess(target: ReviewTarget, poll = false) {
  const auth = useAuthStatus();
  const viewer = auth.address ?? "";
  const access = useQuery({
    ...reviewAccessQueryOptions(reviewsClient, target, viewer),
    enabled: auth.isAuthenticated,
    refetchInterval: poll
      ? (query) => {
          const current = query.state.data;
          return current?.editableUntil || current?.isOwner || current?.hidden ? false : 3000;
        }
      : 30000,
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

export function useResourceReviews(target: ReviewTarget, stars?: number) {
  const client = useQueryClient();
  const key = reviewKeys.resource(target);
  const { auth, access } = useResourceReviewAccess(target);
  const reviews = useInfiniteQuery(reviewsInfiniteQueryOptions(reviewsClient, target, stars));
  const mutation = useMutation({
    mutationFn: (
      action:
        | { kind: "review"; stars: number; text: string }
        | { kind: "reply" | "flag"; id: number; text: string },
    ) => {
      if (action.kind === "review") return reviewsClient.save(target, action.stars, action.text);
      if (action.kind === "reply") return reviewsClient.reply(target, action.id, action.text);
      return reviewsClient.flag(target, action.id, action.text);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  return { auth, access, reviews, mutation };
}
