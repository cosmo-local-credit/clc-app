import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { canWriteReview } from "@clc/core/features/reviews/logic";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useReviewAccess } from "#/features/reviews/hooks/use-voucher-reviews";
import { saveReview } from "#/features/reviews/api/reviews-client";
import { Button } from "#/components/ui/button";
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
  return <EligiblePrompt key={address} address={address} />;
}

function EligiblePrompt({ address }: { address: string }) {
  const { t } = useLingui();
  const client = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState(false);
  const { auth, access } = useReviewAccess(address, !dismissed && !saved);
  const mutation = useMutation({
    mutationFn: ({ stars, text }: { stars: number; text: string }) =>
      saveReview(address, stars, text),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: ["voucher-reviews", address.toLowerCase()] });
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
  if (!access.data || !canWriteReview(access.data))
    return (
      <div className="mb-5 space-y-2 border border-border bg-card p-4 text-sm">
        <p>
          <Trans>
            Your review will be available once this redemption is processed. You can also find it
            later in the voucher’s Reviews tab.
          </Trans>
        </p>
        <Button variant="ghost" tap onClick={() => setDismissed(true)}>
          <Trans>Later</Trans>
        </Button>
      </div>
    );
  return (
    <section className="mb-5 space-y-3 border border-border bg-card p-4">
      <h2 className="font-heading font-semibold">
        {access.data.review ? t`Update your review` : t`How was your experience?`}
      </h2>
      <p className="text-xs text-muted-foreground">
        <Trans>You have seven days after redemption to write or edit your review.</Trans>
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
