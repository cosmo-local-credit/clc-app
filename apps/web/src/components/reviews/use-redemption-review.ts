import { reviewKeys } from "@clc/api/features/reviews/queries";
import {
  canWriteReview,
  type ReviewAccess,
  type ReviewTarget,
} from "@clc/core/features/reviews/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useResourceReviewAccess } from "#/features/reviews/hooks/use-voucher-reviews";
import { reviewsClient } from "#/lib/api/reviews";

/**
 * Whether a send receipt should invite a review of the voucher just redeemed,
 * and the save behind it. A payment to the voucher's issuer is a redemption;
 * the receipt hint only selects the UI, and the server verifies redemption on
 * its own.
 */
export function useIsRedemption(address: string, recipient: string) {
  const detail = useMarketVoucherDetail(address);
  return detail.data?.ownerAddress?.toLowerCase() === recipient.toLowerCase();
}

export type RedemptionReview =
  | { status: "hidden" }
  | { status: "saved" }
  | { status: "error"; retry: () => void; retrying: boolean; dismiss: () => void }
  | { status: "processing"; dismiss: () => void }
  | {
      status: "ready";
      access: ReviewAccess;
      dismiss: () => void;
      save: (stars: number, text: string) => void;
      pending: boolean;
      failed: boolean;
    };

/**
 * The review state for one redeemed voucher or swapped pool. Mount it only
 * once the receipt is known to earn a review.
 */
export function useRedemptionReview(target: ReviewTarget): RedemptionReview {
  const client = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState(false);
  const { auth, access } = useResourceReviewAccess(target, !dismissed && !saved);
  const mutation = useMutation({
    mutationFn: ({ stars, text }: { stars: number; text: string }) =>
      reviewsClient.save(target, stars, text),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: reviewKeys.resource(target) });
    },
  });
  const dismiss = () => setDismissed(true);
  if (dismissed || !auth.isAuthenticated || access.data?.isOwner || access.data?.hidden) {
    return { status: "hidden" };
  }
  if (saved) return { status: "saved" };
  if (access.isError) {
    return {
      status: "error",
      retry: () => void access.refetch(),
      retrying: access.isFetching,
      dismiss,
    };
  }
  if (!access.data || !canWriteReview(access.data)) return { status: "processing", dismiss };
  return {
    status: "ready",
    access: access.data,
    dismiss,
    save: (stars, text) => mutation.mutate({ stars, text }),
    pending: mutation.isPending,
    failed: mutation.isError,
  };
}
