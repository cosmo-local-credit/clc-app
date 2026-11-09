import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { ReviewProcessingMessage } from "#/components/reviews/redemption-review-prompt";
import { ReviewEditor } from "#/components/reviews/review-editor";
import { useRedemptionReview } from "#/components/reviews/use-redemption-review";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";

/**
 * The review a confirmed swap earns, under the receipt in the side column: the
 * phone receipt's prompt with the same states, laid out as the desktop send
 * receipt lays its own. The receipt only selects the UI; the server decides
 * whether this viewer swapped in the pool.
 */
export function PoolSwapReviewDesk({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const review = useRedemptionReview({ kind: "pool", address: poolAddress });
  if (review.status === "hidden") return null;
  if (review.status === "saved") {
    return (
      <p role="status" className="border border-border bg-card p-4 text-sm">
        <Trans>Your review has been saved.</Trans>
      </p>
    );
  }
  if (review.status === "error") {
    return (
      <Notice
        role="alert"
        action={
          <span className="flex shrink-0 gap-2">
            <Button variant="outline" pending={review.retrying} onClick={review.retry}>
              <Trans>Try again</Trans>
            </Button>
            <Button variant="ghost" onClick={review.dismiss}>
              <Trans>Later</Trans>
            </Button>
          </span>
        }
      >
        <Trans>Couldn't check your review access.</Trans>
      </Notice>
    );
  }
  if (review.status === "processing") {
    return (
      <Notice
        action={
          <Button variant="ghost" onClick={review.dismiss}>
            <Trans>Later</Trans>
          </Button>
        }
      >
        <ReviewProcessingMessage kind="pool" />
      </Notice>
    );
  }
  return (
    <section className="grid min-w-0 gap-3 border border-border bg-card p-4">
      <SectionHeading as="h2" variant="group">
        {review.access.review ? t`Update your review` : t`How was your experience?`}
      </SectionHeading>
      <p className="text-xs text-muted-foreground">
        <Trans>You have seven days after the swap to write or edit your review.</Trans>
      </p>
      <ReviewEditor
        initialStars={review.access.review?.stars}
        initialText={review.access.review?.comment}
        pending={review.pending}
        error={review.failed ? t`Couldn't save your review. Please try again.` : null}
        onSave={review.save}
        onCancel={review.dismiss}
      />
    </section>
  );
}

function Notice({
  role,
  action,
  children,
}: {
  role?: "alert";
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className="flex min-w-0 items-center justify-between gap-3 border border-border bg-card p-4"
    >
      <p className="min-w-0 text-sm">{children}</p>
      {action}
    </div>
  );
}
