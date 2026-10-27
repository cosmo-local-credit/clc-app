import { canWriteReview, type VoucherReview } from "@clc/core/features/reviews/logic";
import { useEffect, useState } from "react";

import { useVoucherReviews } from "./use-voucher-reviews";

export type ReviewEditorTarget =
  | { kind: "review" }
  | { kind: "reply" | "flag"; review: VoucherReview };

/**
 * Everything a voucher's reviews surface decides: the star filter, which editor
 * is open, what the viewer may do, and the save that closes the editor. The
 * phone panel and the desktop section render this one state.
 */
export function useVoucherReviewsPanel(address: string) {
  const [filter, setFilter] = useState<number>();
  const [editor, setEditor] = useState<ReviewEditorTarget | null>(null);
  const { auth, access, reviews, mutation } = useVoucherReviews(address, filter);
  const viewer = auth.isAuthenticated ? access.data : undefined;
  const canWrite = viewer ? canWriteReview(viewer) : false;
  useEffect(() => {
    setEditor(null);
    mutation.reset();
  }, [auth.address, auth.isAuthenticated, address]);
  const summary = reviews.data?.pages[0];
  const summaryTotal = summary && Number.isFinite(summary.total) ? (summary.total ?? 0) : 0;
  const summaryAverage = summary && Number.isFinite(summary.average) ? (summary.average ?? 0) : 0;
  const summaryCounts = summary?.counts ?? {};
  const items = reviews.data?.pages.flatMap((page) => page.reviews ?? []) ?? [];

  function open(next: ReviewEditorTarget) {
    mutation.reset();
    setEditor(next);
  }

  function save(current: ReviewEditorTarget, stars: number, text: string) {
    mutation.mutate(
      current.kind === "review"
        ? { kind: "review", stars, text }
        : { kind: current.kind, id: current.review.id, text },
      { onSuccess: () => setEditor(null) },
    );
  }

  /** The text an editor opens with: the viewer's review, the owner's reply, or blank. */
  function initialText(current: ReviewEditorTarget) {
    if (current.kind === "review") return viewer?.review?.comment;
    if (current.kind === "reply") return current.review.reply ?? "";
    return "";
  }

  return {
    auth,
    access,
    reviews,
    mutation,
    viewer,
    canWrite,
    filter,
    setFilter,
    editor,
    setEditor,
    open,
    save,
    initialText,
    summary,
    summaryTotal,
    summaryAverage,
    summaryCounts,
    items,
  };
}
