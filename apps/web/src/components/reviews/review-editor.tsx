import { REVIEW_TEXT_LIMIT } from "@clc/core/features/reviews/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";
import { RiStarFill, RiStarHalfFill, RiStarLine } from "react-icons/ri";
import { Button } from "#/components/ui/button";

export function ReviewStars({ stars }: { stars: number }) {
  const { i18n, t } = useLingui();
  const safeStars = Number.isFinite(stars) ? Math.min(5, Math.max(0, stars)) : 0;
  const visualStars = Math.round(safeStars * 2) / 2;
  const formattedStars = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
    maximumFractionDigits: 1,
  }).format(safeStars);
  return (
    <span
      className="inline-flex text-amber-600"
      role="img"
      aria-label={t`${formattedStars} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => {
        if (visualStars >= value) {
          return <RiStarFill key={value} className="size-4" data-state="full" aria-hidden="true" />;
        }
        if (visualStars === value - 0.5) {
          return (
            <RiStarHalfFill key={value} className="size-4" data-state="half" aria-hidden="true" />
          );
        }
        return <RiStarLine key={value} className="size-4" data-state="empty" aria-hidden="true" />;
      })}
    </span>
  );
}

export function ReviewEditor({
  initialStars = 0,
  initialText = "",
  kind = "review",
  pending,
  error,
  onSave,
  onCancel,
}: {
  initialStars?: number;
  initialText?: string;
  kind?: "review" | "reply" | "flag";
  pending: boolean;
  error: string | null;
  onSave: (stars: number, text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const id = useId();
  const [stars, setStars] = useState(initialStars);
  const [text, setText] = useState(initialText);
  const limit = kind === "flag" ? 500 : REVIEW_TEXT_LIMIT;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(stars, text.trim());
      }}
    >
      {kind === "review" ? (
        <fieldset disabled={pending}>
          <legend className="mb-1 text-sm font-semibold">
            <Trans>Your rating</Trans>
          </legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                className="relative flex size-11 cursor-pointer items-center justify-center text-amber-600 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
              >
                <input
                  className="sr-only"
                  type="radio"
                  name={`${id}-stars`}
                  value={value}
                  checked={stars === value}
                  onChange={() => setStars(value)}
                  aria-label={t`${value} stars`}
                  required
                />
                {value <= stars ? (
                  <RiStarFill className="size-8" aria-hidden="true" />
                ) : (
                  <RiStarLine className="size-8" aria-hidden="true" />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <label htmlFor={id} className="mb-1 block text-sm font-semibold">
          {kind === "review"
            ? t`Comment (optional)`
            : kind === "reply"
              ? t`Your reply`
              : t`Reason for reporting`}
        </label>
        <textarea
          id={id}
          className="min-h-28 w-full resize-y border border-border bg-card p-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={limit}
          required={kind !== "review"}
          disabled={pending}
        />
        <p className="text-right text-xs text-muted-foreground">
          {text.length}/{limit}
        </p>
      </div>
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
      {/* Stacked: German's "Send report" and "Cancel" outgrow one 360px row. */}
      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={kind === "review" ? stars === 0 : !text.trim()}
          pending={pending}
        >
          {pending ? t`Saving…` : kind === "flag" ? t`Send report` : t`Save`}
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </form>
  );
}
