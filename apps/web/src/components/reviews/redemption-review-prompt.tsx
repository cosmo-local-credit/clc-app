import type { ReviewResourceKind, ReviewTarget } from "@clc/core/features/reviews/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { ReviewEditor } from "./review-editor";
import { useIsRedemption, useRedemptionReview } from "./use-redemption-review";

/** Receipt hints only select the UI. The server independently verifies redemption. */
export function RedemptionReviewPrompt({
  address,
  recipient,
}: {
  address: string;
  recipient: string;
}) {
  if (!useIsRedemption(address, recipient)) return null;
  return <EligiblePrompt key={address} target={{ kind: "voucher", address }} />;
}

export function PoolSwapReviewPrompt({ address }: { address: string }) {
  return <EligiblePrompt key={address} target={{ kind: "pool", address }} />;
}

function EligiblePrompt({ target }: { target: ReviewTarget }) {
  const { t } = useLingui();
  const review = useRedemptionReview(target);
  if (review.status === "hidden") return null;
  if (review.status === "saved")
    return (
      <p role="status" className="mb-5 border border-border bg-card p-4 text-sm">
        <Trans>Your review has been saved.</Trans>
      </p>
    );
  if (review.status === "error")
    return (
      <div role="alert" className="mb-5 space-y-2 border border-border bg-card p-4 text-sm">
        <p>
          <Trans>Couldn't check your review access.</Trans>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" tap pending={review.retrying} onClick={review.retry}>
            <Trans>Try again</Trans>
          </Button>
          <Button variant="ghost" tap onClick={review.dismiss}>
            <Trans>Later</Trans>
          </Button>
        </div>
      </div>
    );
  if (review.status === "processing")
    return (
      <div className="mb-5 space-y-2 border border-border bg-card p-4 text-sm">
        <p>
          <ReviewProcessingMessage kind={target.kind} />
        </p>
        <Button variant="ghost" tap onClick={review.dismiss}>
          <Trans>Later</Trans>
        </Button>
      </div>
    );
  return (
    <section className="mb-5 space-y-3 border border-border bg-card p-4">
      <SectionHeading>
        {review.access.review ? t`Update your review` : t`How was your experience?`}
      </SectionHeading>
      <p className="text-xs text-muted-foreground">
        {target.kind === "voucher" ? (
          <Trans>You have seven days after redemption to write or edit your review.</Trans>
        ) : (
          <Trans>You have seven days after the swap to write or edit your review.</Trans>
        )}
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

function ReviewProcessingMessage({ kind }: { kind: ReviewResourceKind }) {
  if (kind === "voucher") {
    return (
      <Trans>
        Your review will be available once this redemption is processed. You can also find it later
        in the voucher’s Reviews section.
      </Trans>
    );
  }
  return (
    <Trans>
      Your review will be available once this swap is processed. You can also find it later in the
      pool’s Reviews section.
    </Trans>
  );
}
