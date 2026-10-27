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
  return <EligiblePrompt key={address} address={address} />;
}

function EligiblePrompt({ address }: { address: string }) {
  const { t } = useLingui();
  const review = useRedemptionReview(address);
  if (review.status === "hidden") return null;
  if (review.status === "saved")
    return (
      <p role="status" className="mb-5 border border-border bg-card p-4 text-sm">
        <Trans>Your review has been saved.</Trans>
      </p>
    );
  if (review.status === "processing")
    return (
      <div className="mb-5 space-y-2 border border-border bg-card p-4 text-sm">
        <p>
          <Trans>
            Your review will be available once this redemption is processed. You can also find it
            later in the voucher’s Reviews tab.
          </Trans>
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
        <Trans>You have seven days after redemption to write or edit your review.</Trans>
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
