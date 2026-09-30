import { canWriteReview, REVIEW_STARS, type VoucherReview } from "@clc/core/features/reviews/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { useVoucherReviews } from "#/features/reviews/hooks/use-voucher-reviews";
import { ReviewEditor, ReviewStars } from "./review-editor";

type Editor = { kind: "review" } | { kind: "reply" | "flag"; review: VoucherReview };

export function VoucherReviewsPanel({ address }: { address: string }) {
  const { t } = useLingui();
  const [filter, setFilter] = useState<number>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const { auth, access, reviews, mutation } = useVoucherReviews(address, filter);
  const viewer = auth.isAuthenticated ? access.data : undefined;
  const canWrite = viewer ? canWriteReview(viewer) : false;
  useEffect(() => {
    setEditor(null);
    mutation.reset();
  }, [auth.address, auth.isAuthenticated, address]);
  const summary = reviews.data?.pages[0];
  const items = reviews.data?.pages.flatMap((page) => page.reviews) ?? [];
  const open = (next: Editor) => {
    mutation.reset();
    setEditor(next);
  };
  const renderEditor = (current: Editor) => (
    <ReviewEditor
      key={current.kind === "review" ? "review" : `${current.kind}-${current.review.id}`}
      kind={current.kind}
      initialStars={current.kind === "review" ? viewer?.review?.stars : undefined}
      initialText={
        current.kind === "review"
          ? viewer?.review?.comment
          : current.kind === "reply"
            ? (current.review.reply ?? "")
            : ""
      }
      pending={mutation.isPending}
      error={mutation.isError ? t`Couldn't save. Please try again.` : null}
      onCancel={() => setEditor(null)}
      onSave={(stars, text) =>
        mutation.mutate(
          current.kind === "review"
            ? { kind: "review", stars, text }
            : { kind: current.kind, id: current.review.id, text },
          { onSuccess: () => setEditor(null) },
        )
      }
    />
  );

  return (
    <section
      id="voucher-panel-reviews"
      role="tabpanel"
      aria-labelledby="voucher-tab-reviews"
      className="space-y-3"
    >
      {reviews.isPending ? (
        <p className="p-4 text-sm text-muted-foreground">
          <Trans>Loading reviews…</Trans>
        </p>
      ) : null}
      {reviews.isError ? (
        <div role="alert" className="border border-border bg-card p-4">
          <p>
            <Trans>Couldn't load reviews.</Trans>
          </p>
          <Button variant="outline" onClick={() => reviews.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {summary?.total === 0 ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trans>No reviews yet.</Trans>
        </p>
      ) : summary ? (
        <div className="border border-border bg-card p-4">
          <div className="flex items-center gap-5">
            <div className="shrink-0 text-center">
              <p className="font-heading text-4xl font-bold">{summary.average.toFixed(1)}</p>
              <ReviewStars stars={Math.round(summary.average)} />
              <p className="mt-1 text-xs text-muted-foreground">
                <Trans>{summary.total} reviews</Trans>
              </p>
            </div>
            <div className="min-w-0 flex-1" aria-label={t`Ratings distribution`}>
              {REVIEW_STARS.map((stars) => (
                <button
                  key={stars}
                  type="button"
                  aria-pressed={filter === stars}
                  aria-label={t`Show ${stars}-star reviews`}
                  onClick={() => setFilter(filter === stars ? undefined : stars)}
                  className="flex min-h-9 w-full items-center gap-2 text-xs focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="w-5">{stars}★</span>
                  <span
                    className={`h-2 flex-1 overflow-hidden rounded-full ${filter === stars ? "bg-primary/20 ring-1 ring-primary" : "bg-muted"}`}
                  >
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{
                        width: `${summary.total ? ((summary.counts[stars] ?? 0) / summary.total) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-7 text-right tabular-nums">{summary.counts[stars] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 border border-border bg-card p-4">
        {!auth.isAuthenticated ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Sign in after redeeming this voucher to leave a review.</Trans>
          </p>
        ) : access.isPending ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Checking review eligibility…</Trans>
          </p>
        ) : access.isError ? (
          <>
            <p className="text-sm text-muted-foreground">
              <Trans>Couldn't check your review access.</Trans>
            </p>
            <Button variant="outline" onClick={() => access.refetch()}>
              <Trans>Try again</Trans>
            </Button>
          </>
        ) : viewer?.isOwner ? (
          <p className="text-sm text-muted-foreground">
            <Trans>
              You can reply to reviews and report inappropriate content. You can edit only replies
              you wrote yourself.
            </Trans>
          </p>
        ) : viewer?.hidden ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Your review was hidden by an admin.</Trans>
          </p>
        ) : (
          <>
            {viewer?.review ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  <Trans>Your review</Trans>
                </h3>
                <ReviewStars stars={viewer.review.stars} />
                <p className="text-sm break-words whitespace-pre-wrap">{viewer.review.comment}</p>
              </div>
            ) : null}
            {canWrite ? (
              <>
                <p className="text-xs text-muted-foreground">
                  <Trans>
                    You can write or edit your review until{" "}
                    {new Date(viewer!.editableUntil!).toLocaleString()}.
                  </Trans>
                </p>
                {editor?.kind === "review" ? (
                  renderEditor(editor)
                ) : (
                  <Button onClick={() => open({ kind: "review" })}>
                    {viewer?.review ? t`Edit your review` : t`Write a review`}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {viewer?.review
                  ? t`Redeem this voucher again to update your review.`
                  : t`Redeem this voucher to leave a review within seven days.`}
              </p>
            )}
          </>
        )}
      </div>

      {summary && summary.total > 0 ? (
        <>
          <div className="flex min-h-10 items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {filter ? t`${filter}-star reviews · newest first` : t`All reviews · newest first`}
            </span>
            {filter ? (
              <Button variant="ghost" size="sm" onClick={() => setFilter(undefined)}>
                <Trans>Show all</Trans>
              </Button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
              {filter ? t`No reviews with this rating.` : t`No reviews yet.`}
            </p>
          ) : null}
          {items.map((review) => (
            <article
              key={review.id}
              className="space-y-3 border border-border bg-card p-4"
              aria-label={t`Voucher review`}
            >
              <ReviewStars stars={review.stars} />
              {review.comment ? (
                <p className="text-sm break-words whitespace-pre-wrap">{review.comment}</p>
              ) : null}
              {review.reply ? (
                <div className="space-y-1 border-l-2 border-primary bg-muted/40 p-3">
                  <h3 className="text-xs font-semibold">
                    <Trans>Owner reply</Trans>
                  </h3>
                  <p className="text-sm break-words whitespace-pre-wrap">{review.reply}</p>
                </div>
              ) : null}
              {viewer?.isOwner ? (
                <div className="flex flex-wrap gap-2">
                  {!review.reply || viewer.editableReplyIds.includes(review.id) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => open({ kind: "reply", review })}
                    >
                      {review.reply ? t`Edit your reply` : t`Reply`}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={viewer.flaggedReviewIds.includes(review.id)}
                    onClick={() => open({ kind: "flag", review })}
                  >
                    {viewer.flaggedReviewIds.includes(review.id)
                      ? t`Reported`
                      : t`Report inappropriate`}
                  </Button>
                </div>
              ) : null}
              {viewer?.isOwner &&
              editor &&
              editor.kind !== "review" &&
              editor.review.id === review.id
                ? renderEditor(editor)
                : null}
            </article>
          ))}
          {reviews.hasNextPage ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={reviews.isFetchingNextPage}
              onClick={() => reviews.fetchNextPage()}
            >
              {reviews.isFetchingNextPage ? t`Loading…` : t`Load more reviews`}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
