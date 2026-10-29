import {
  buildOfferingOrderNote,
  OFFERING_ORDER_NOTE_MAX_LENGTH,
} from "@clc/core/features/offerings/order";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { OfferingOrderPicker } from "#/components/offerings";
import { ReviewEditor } from "#/components/reviews/review-editor";
import { useIsRedemption, useRedemptionReview } from "#/components/reviews/use-redemption-review";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field } from "#/components/ui/field";
import { SectionHeading } from "#/components/ui/section-heading";
import { Textarea } from "#/components/ui/textarea";
import { useSendShareForm } from "#/features/wallet/hooks/use-send-share-form";

/**
 * "Add a message or place an order" under the receipt rows, as the desktop
 * inspector lays it out: a heading, the message, the contact details to share,
 * the order picker when the recipient sells against this voucher, and Share.
 */
export function SendShareDesk({
  txHash,
  recipientAddress,
  tokenAddress,
  voucherSymbol,
}: {
  txHash: string;
  recipientAddress: string;
  tokenAddress: string | undefined;
  voucherSymbol: string;
}) {
  const { t } = useLingui();
  const share = useSendShareForm({ txHash, recipientAddress, tokenAddress, voucherSymbol });
  const { form, orderLines, orderLabels } = share;

  if (share.eligibility.isPending) {
    return (
      <Notice>
        <Trans>Checking message availability…</Trans>
      </Notice>
    );
  }
  if (share.eligibility.isError) {
    return (
      <Notice
        action={
          <Button
            type="button"
            variant="outline"
            pending={share.eligibility.isFetching}
            onClick={() => void share.eligibility.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        }
      >
        <Trans>Couldn't check message availability.</Trans>
      </Notice>
    );
  }
  if (!share.eligibility.data) {
    return (
      <Notice>
        <Trans>Messages are available only for registered Cosmo users.</Trans>
      </Notice>
    );
  }
  if (share.createShare.isSuccess) {
    return (
      <p
        role="status"
        className="border border-primary/30 bg-card p-3 text-sm font-semibold text-primary"
      >
        {orderLines.length > 0 ? (
          <Trans>Message or order shared.</Trans>
        ) : (
          <Trans>Message shared.</Trans>
        )}
      </p>
    );
  }
  if (share.orderCheckLoading) {
    return (
      <Notice>
        <Trans>Checking order availability…</Trans>
      </Notice>
    );
  }

  const contactOptions = [
    share.hasEmail ? (["email", t`Email`] as const) : null,
    share.hasPhone ? (["phone", t`Phone`] as const) : null,
    share.hasLocation ? (["location", t`Location`] as const) : null,
  ].filter((option) => option !== null);

  return (
    <form
      className="grid min-w-0 gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <SectionHeading as="h2" variant="group">
        {share.orderReady ? (
          <Trans>Add a message or place an order</Trans>
        ) : (
          <Trans>Add a private message</Trans>
        )}
      </SectionHeading>
      {share.orderCheckError ? (
        <Notice
          action={
            <Button
              type="button"
              variant="outline"
              pending={share.voucher.isFetching || share.offeringsQuery.isFetching}
              onClick={() => {
                if (share.voucher.isError) {
                  void share.voucher.refetch();
                  return;
                }
                void share.offeringsQuery.refetch();
              }}
            >
              <Trans>Retry</Trans>
            </Button>
          }
        >
          <Trans>Couldn't check order availability.</Trans>
        </Notice>
      ) : null}
      <form.Field name="note">
        {(field) => (
          <Field
            label={t`Message`}
            htmlFor="send-share-note"
            error={getFieldError(field.state.meta.errors)}
          >
            <Textarea
              id="send-share-note"
              value={field.state.value}
              maxLength={500}
              placeholder={t`Optional message`}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {orderLines.length > 0 ? (
              <OrderNoteLength message={field.state.value} share={share} />
            ) : null}
          </Field>
        )}
      </form.Field>
      {contactOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {contactOptions.map(([name, label]) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <label
                  htmlFor={`send-share-${name}`}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    id={`send-share-${name}`}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                  {label}
                </label>
              )}
            </form.Field>
          ))}
        </div>
      ) : null}
      {share.orderReady ? (
        <OfferingOrderPicker
          offerings={share.offerings}
          quantities={share.orderQuantities}
          onQuantitiesChange={share.changeOrderQuantities}
          {...share.orderContext}
        />
      ) : null}
      {share.orderFormError ? (
        <p className="text-xs text-destructive" role="alert">
          {share.orderFormError}
        </p>
      ) : null}
      {share.createShare.error ? (
        <p className="text-xs text-destructive" role="alert">
          {share.createShare.error instanceof Error
            ? share.createShare.error.message
            : t`Couldn't share this message.`}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const note = buildOfferingOrderNote({
            message: values.note,
            lines: orderLines,
            labels: orderLabels,
          });
          const hasContent =
            values.note.trim() !== "" ||
            orderLines.length > 0 ||
            values.email ||
            values.phone ||
            values.location;
          return (
            <Button
              type="submit"
              variant="outline"
              className="justify-self-start"
              disabled={!hasContent || !note.ok}
              pending={share.createShare.isPending}
            >
              {share.createShare.isPending ? <Trans>Sharing…</Trans> : <Trans>Share</Trans>}
            </Button>
          );
        }}
      </form.Subscribe>
    </form>
  );
}

function OrderNoteLength({
  message,
  share,
}: {
  message: string;
  share: Pick<ReturnType<typeof useSendShareForm>, "orderLines" | "orderLabels">;
}) {
  const result = buildOfferingOrderNote({
    message,
    lines: share.orderLines,
    labels: share.orderLabels,
  });
  return (
    <p className="mt-1 text-end font-mono text-xs text-muted-foreground">
      {result.ok
        ? `${result.note.length}/${OFFERING_ORDER_NOTE_MAX_LENGTH}`
        : `>${OFFERING_ORDER_NOTE_MAX_LENGTH}`}
    </p>
  );
}

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border border-border bg-card p-3">
      <p className="min-w-0 text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

/** The review invitation a redemption earns, laid out for the inspector. */
export function RedemptionReviewDesk({
  address,
  recipient,
}: {
  address: string;
  recipient: string;
}) {
  if (!useIsRedemption(address, recipient)) return null;
  return <RedemptionReviewBody key={address} address={address} />;
}

function RedemptionReviewBody({ address }: { address: string }) {
  const { t } = useLingui();
  const review = useRedemptionReview(address);
  if (review.status === "hidden") return null;
  if (review.status === "saved") {
    return (
      <p role="status" className="border border-border bg-card p-3 text-sm">
        <Trans>Your review has been saved.</Trans>
      </p>
    );
  }
  if (review.status === "processing") {
    return (
      <Notice
        action={
          <Button type="button" variant="ghost" onClick={review.dismiss}>
            <Trans>Later</Trans>
          </Button>
        }
      >
        <Trans>
          Your review will be available once this redemption is processed. You can also find it
          later in the voucher’s Reviews tab.
        </Trans>
      </Notice>
    );
  }
  return (
    <section className="grid min-w-0 gap-3">
      <SectionHeading as="h2" variant="group">
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
