import type { ReviewTarget } from "@clc/core/features/reviews/logic";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import type { ReviewsClient } from "./client";

function canonicalTarget(target: ReviewTarget) {
  return { kind: target.kind, address: target.address.toLowerCase() } as const;
}

export const reviewKeys = {
  all: ["clc", "reviews"] as const,
  resource: (target: ReviewTarget) => ["clc", "reviews", canonicalTarget(target)] as const,
  public: (target: ReviewTarget, stars?: number) =>
    [...reviewKeys.resource(target), "public", stars] as const,
  access: (target: ReviewTarget, viewer: string) =>
    [...reviewKeys.resource(target), "access", viewer.toLowerCase()] as const,
};

export function reviewsInfiniteQueryOptions(
  reviews: ReviewsClient,
  target: ReviewTarget,
  stars?: number,
) {
  return infiniteQueryOptions({
    queryKey: reviewKeys.public(target, stars),
    queryFn: ({ pageParam, signal }) => reviews.list(target, { stars, before: pageParam }, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
  });
}

export function reviewAccessQueryOptions(
  reviews: ReviewsClient,
  target: ReviewTarget,
  viewer: string,
) {
  return queryOptions({
    queryKey: reviewKeys.access(target, viewer),
    queryFn: ({ signal }) => reviews.access(target, signal),
    staleTime: 0,
  });
}
