import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  canWriteReview,
  type ReviewResourceKind,
  type ReviewTarget,
} from "@clc/core/features/reviews/logic";
import { reviewKeys } from "@clc/api/features/reviews/queries";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useResourceReviewAccess } from "#/features/reviews/hooks/use-voucher-reviews";
import { reviewsClient } from "#/lib/api/reviews";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { ReviewEditor } from "./review-editor";

/** Receipt hints only select the UI. The server independently verifies redemption. */
export function RedemptionReviewPrompt({
  address,
  recipient,
}: {
  address: string;
  recipient: string;
}) {
  const detail = useMarketVoucherDetail(address);
  if (detail.data?.ownerAddress?.toLowerCase() !== recipient.toLowerCase()) return null;
  return <EligiblePrompt key={address} target={{ kind: "voucher", address }} />;
}

export function PoolSwapReviewPrompt({ address }: { address: string }) {
  return <EligiblePrompt key={address} target={{ kind: "pool", address }} />;
}

function EligiblePrompt({ target }: { target: ReviewTarget }) {
  const { t } = useLingui();
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
  if (dismissed || !auth.isAuthenticated || access.data?.isOwner || access.data?.hidden)
    return null;
  if (saved)
    return (
      <p role="status" className="mb-5 border border-border bg-card p-4 text-sm">
        <Trans>Your review has been saved.</Trans>
      </p>
    );
  if (access.isError)
    return (
      <div role="alert" className="mb-5 space-y-2 border border-border bg-card p-4 text-sm">
        <p>
          <Trans>Couldn't check your review access.</Trans>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            tap
            pending={access.isFetching}
            onClick={() => void access.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
          <Button variant="ghost" tap onClick={() => setDismissed(true)}>
            <Trans>Later</Trans>
          </Button>
        </div>
      </div>
    );
  if (!access.data || !canWriteReview(access.data))
    return (
      <div className="mb-5 space-y-2 border border-border bg-card p-4 text-sm">
        <p>
          <ReviewProcessingMessage kind={target.kind} />
        </p>
        <Button variant="ghost" tap onClick={() => setDismissed(true)}>
          <Trans>Later</Trans>
        </Button>
      </div>
    );
  return (
    <section className="mb-5 space-y-3 border border-border bg-card p-4">
      <SectionHeading>
        {access.data.review ? t`Update your review` : t`How was your experience?`}
      </SectionHeading>
      <p className="text-xs text-muted-foreground">
        {target.kind === "voucher" ? (
          <Trans>You have seven days after redemption to write or edit your review.</Trans>
        ) : (
          <Trans>You have seven days after the swap to write or edit your review.</Trans>
        )}
      </p>
      <ReviewEditor
        initialStars={access.data.review?.stars}
        initialText={access.data.review?.comment}
        pending={mutation.isPending}
        error={mutation.isError ? t`Couldn't save your review. Please try again.` : null}
        onSave={(stars, text) => mutation.mutate({ stars, text })}
        onCancel={() => setDismissed(true)}
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
