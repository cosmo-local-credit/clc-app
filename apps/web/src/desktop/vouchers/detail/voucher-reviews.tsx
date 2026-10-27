import { REVIEW_STARS, REVIEW_TEXT_LIMIT } from "@clc/core/features/reviews/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";
import { RiStarFill, RiStarLine } from "react-icons/ri";

import { ReviewStars } from "#/components/reviews/review-editor";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { DeskPanel, DeskSection, deskSectionLinkClass } from "#/desktop/ui/page";
import {
  type ReviewEditorTarget,
  useVoucherReviewsPanel,
} from "#/features/reviews/hooks/use-voucher-reviews-panel";
import { cn } from "#/lib/utils";

import { VoucherDialog } from "./voucher-dialog";

/**
 * Reviews: the average beside the list, as the mock lays it out, with the
 * phone's star filter under the average. Writing, replying and reporting each
 * open the same editor as a dialog; "Write a review" sits in the header.
 */
export function VoucherReviewsDesk({
  address,
  layout,
}: {
  address: string;
  layout: "page" | "panel";
}) {
  const { t, i18n } = useLingui();
  const panel = useVoucherReviewsPanel(address);
  const {
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
    summary,
    summaryTotal,
    summaryAverage,
    summaryCounts,
    items,
  } = panel;
  const locale = i18n.locales?.[0] ?? i18n.locale;

  const write = canWrite ? (
    <button
      type="button"
      className={deskSectionLinkClass()}
      onClick={() => open({ kind: "review" })}
    >
      {viewer?.review ? t`Edit your review` : t`Write a review`}
    </button>
  ) : null;

  // Why a non-owner cannot write, or the retry when the check failed.
  let status = null;
  if (!viewer?.isOwner && !canWrite) {
    if (!auth.isAuthenticated) {
      status = <Trans>Sign in after redeeming this voucher to leave a review.</Trans>;
    } else if (access.isPending) {
      status = <Trans>Checking review eligibility…</Trans>;
    } else if (access.isError) {
      status = (
        <span className="inline-flex items-center gap-2">
          <Trans>Couldn't check your review access.</Trans>
          <Button variant="ghost" pending={access.isFetching} onClick={() => void access.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </span>
      );
    } else if (viewer?.hidden) {
      status = <Trans>Your review was hidden by an admin.</Trans>;
    } else if (viewer) {
      status = viewer.review
        ? t`Redeem this voucher again to update your review.`
        : t`Redeem this voucher to leave a review within seven days.`;
    }
  }

  const body = (
    <div className="grid gap-2">
      {reviews.isPending ? (
        <DeskPanel>
          <p className="text-sm text-muted-foreground">
            <Trans>Loading reviews…</Trans>
          </p>
        </DeskPanel>
      ) : reviews.isError ? (
        <div
          role="alert"
          className="grid justify-items-start gap-3 border border-border bg-card p-4"
        >
          <p className="text-sm">
            <Trans>Couldn't load reviews.</Trans>
          </p>
          <Button
            variant="outline"
            pending={reviews.isFetching}
            onClick={() => void reviews.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : summary && summaryTotal === 0 ? (
        <DeskPanel>
          <p className="text-sm text-muted-foreground">
            <Trans>No reviews yet.</Trans>
          </p>
        </DeskPanel>
      ) : summary ? (
        <div
          className={cn(
            "grid border border-border bg-card",
            layout === "page" ? "grid-cols-[180px_minmax(0,1fr)]" : "grid-cols-1",
          )}
        >
          <div
            className={cn(
              "grid content-start gap-2 p-4",
              layout === "page" ? "border-border border-e" : "border-border border-b",
            )}
          >
            <p className="font-heading text-4xl leading-none font-bold tracking-tight">
              {new Intl.NumberFormat(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(summaryAverage)}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ReviewStars stars={summaryAverage} />
              <span>·</span>
              <span>{new Intl.NumberFormat(locale).format(summaryTotal)}</span>
            </p>
            <div className="mt-1 grid gap-0.5" aria-label={t`Ratings distribution`}>
              {REVIEW_STARS.map((stars) => {
                const count = summaryCounts[stars] ?? 0;
                return (
                  <button
                    key={stars}
                    type="button"
                    aria-pressed={filter === stars}
                    aria-label={t`Show ${stars}-star reviews`}
                    onClick={() => setFilter(filter === stars ? undefined : stars)}
                    className={cn(
                      "flex h-6 w-full items-center gap-2 px-1 text-xs outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
                      filter === stars && "bg-muted",
                    )}
                  >
                    <span className="w-6 text-start">{stars}★</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${summaryTotal ? (count / summaryTotal) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-6 text-end tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            {filter ? (
              <Button
                variant="ghost"
                className="justify-self-start"
                onClick={() => setFilter(undefined)}
              >
                <Trans>Show all</Trans>
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col [&>*+*]:border-border [&>*+*]:border-t">
            {viewer?.review && !viewer.isOwner ? (
              <article className="grid gap-1 bg-muted/40 px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Trans>Your review</Trans>
                  <ReviewStars stars={viewer.review.stars} />
                </p>
                {viewer.review.comment ? (
                  <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
                    {viewer.review.comment}
                  </p>
                ) : null}
              </article>
            ) : null}
            {items.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-muted-foreground">
                {filter ? t`No reviews with this rating.` : t`No reviews yet.`}
              </p>
            ) : null}
            {items.map((review) => (
              <article
                key={review.id}
                className="grid gap-1 px-3.5 py-3"
                aria-label={t`Voucher review`}
              >
                <ReviewStars stars={review.stars} />
                {review.comment ? (
                  <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
                    {review.comment}
                  </p>
                ) : null}
                {review.reply ? (
                  <div className="mt-1 grid gap-0.5 border-primary border-s-2 bg-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold">
                      <Trans>Owner reply</Trans>
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">{review.reply}</p>
                  </div>
                ) : null}
                {viewer?.isOwner ? (
                  <div className="mt-1 flex flex-wrap gap-3">
                    {!review.reply || viewer.editableReplyIds.includes(review.id) ? (
                      <button
                        type="button"
                        className={deskSectionLinkClass()}
                        onClick={() => open({ kind: "reply", review })}
                      >
                        {review.reply ? t`Edit your reply` : t`Reply`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted-foreground hover:underline disabled:no-underline disabled:opacity-60"
                      disabled={viewer.flaggedReviewIds.includes(review.id)}
                      onClick={() => open({ kind: "flag", review })}
                    >
                      {viewer.flaggedReviewIds.includes(review.id)
                        ? t`Reported`
                        : t`Report inappropriate`}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {reviews.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-start"
          pending={reviews.isFetchingNextPage}
          onClick={() => reviews.fetchNextPage()}
        >
          {reviews.isFetchingNextPage ? t`Loading…` : t`Load more reviews`}
        </Button>
      ) : null}
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      <ReviewEditorDialog
        target={editor}
        initialStars={editor?.kind === "review" ? viewer?.review?.stars : undefined}
        initialText={editor ? panel.initialText(editor) : undefined}
        editableUntil={viewer?.editableUntil ?? null}
        pending={mutation.isPending}
        error={mutation.isError ? t`Couldn't save. Please try again.` : null}
        onClose={() => setEditor(null)}
        onSave={(stars, text) => editor && panel.save(editor, stars, text)}
      />
    </div>
  );

  if (layout === "panel") {
    return (
      <div className="grid gap-3">
        {write ? <div className="flex h-[30px] items-center justify-end">{write}</div> : null}
        {body}
      </div>
    );
  }
  return (
    <DeskSection title={<Trans>Reviews</Trans>} action={write}>
      {body}
    </DeskSection>
  );
}

/** The phone's review editor — rating, text, its rules — as a dialog. */
function ReviewEditorDialog({
  target,
  initialStars,
  initialText,
  editableUntil,
  pending,
  error,
  onClose,
  onSave,
}: {
  target: ReviewEditorTarget | null;
  initialStars?: number;
  initialText?: string;
  editableUntil: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (stars: number, text: string) => void;
}) {
  const formId = useId();
  const kind = target?.kind ?? "review";
  return (
    <VoucherDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        kind === "review" ? (
          initialStars ? (
            <Trans>Edit your review</Trans>
          ) : (
            <Trans>Write a review</Trans>
          )
        ) : kind === "reply" ? (
          <Trans>Reply</Trans>
        ) : (
          <Trans>Report inappropriate</Trans>
        )
      }
    >
      {target ? (
        <ReviewForm
          key={target.kind === "review" ? "review" : `${target.kind}-${target.review.id}`}
          formId={formId}
          kind={kind}
          initialStars={initialStars ?? 0}
          initialText={initialText ?? ""}
          editableUntil={editableUntil}
          pending={pending}
          error={error}
          onCancel={onClose}
          onSave={onSave}
        />
      ) : null}
    </VoucherDialog>
  );
}

function ReviewForm({
  formId,
  kind,
  initialStars,
  initialText,
  editableUntil,
  pending,
  error,
  onCancel,
  onSave,
}: {
  formId: string;
  kind: ReviewEditorTarget["kind"];
  initialStars: number;
  initialText: string;
  editableUntil: string | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (stars: number, text: string) => void;
}) {
  const { t } = useLingui();
  const [stars, setStars] = useState(initialStars);
  const [text, setText] = useState(initialText);
  const limit = kind === "flag" ? 500 : REVIEW_TEXT_LIMIT;
  return (
    <form
      id={formId}
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(stars, text.trim());
      }}
    >
      {kind === "review" ? (
        <fieldset disabled={pending} className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            <Trans>Your rating</Trans>
          </legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                className="flex size-9 cursor-pointer items-center justify-center text-amber-600 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
              >
                <input
                  className="sr-only"
                  type="radio"
                  name={`${formId}-stars`}
                  value={value}
                  checked={stars === value}
                  onChange={() => setStars(value)}
                  aria-label={t`${value} stars`}
                  required
                />
                {value <= stars ? (
                  <RiStarFill className="size-6" aria-hidden="true" />
                ) : (
                  <RiStarLine className="size-6" aria-hidden="true" />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid gap-1.5">
        <label htmlFor={`${formId}-text`} className="text-sm font-medium">
          {kind === "review"
            ? t`Comment (optional)`
            : kind === "reply"
              ? t`Your reply`
              : t`Reason for reporting`}
        </label>
        <Textarea
          id={`${formId}-text`}
          className="min-h-28 bg-card"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={limit}
          required={kind !== "review"}
          disabled={pending}
        />
        <p className="text-end font-mono text-xs text-muted-foreground">
          {text.length}/{limit}
        </p>
      </div>
      {kind === "review" && editableUntil ? (
        <p className="text-xs text-muted-foreground">
          <Trans>
            You can write or edit your review until {new Date(editableUntil).toLocaleString()}.
          </Trans>
        </p>
      ) : null}
      {kind === "review" ? (
        <p className="text-xs text-muted-foreground">
          <Trans>
            Your name and wallet address will not be shown. Avoid including personal details in your
            comment.
          </Trans>
        </p>
      ) : null}
      {kind === "flag" ? (
        <p className="text-xs text-muted-foreground">
          <Trans>
            Admins will review your report. The review stays visible until they make a decision.
          </Trans>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          type="submit"
          disabled={kind === "review" ? stars === 0 : !text.trim()}
          pending={pending}
        >
          {pending ? t`Saving…` : kind === "flag" ? t`Send report` : t`Save`}
        </Button>
      </div>
    </form>
  );
}
