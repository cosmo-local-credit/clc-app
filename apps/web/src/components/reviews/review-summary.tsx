import type { ReviewResourceKind } from "@clc/core/features/reviews/logic";
import { useLingui } from "@lingui/react/macro";

import { useReviewSummary } from "#/features/reviews/hooks/use-voucher-reviews";
import { ReviewStars } from "./review-editor";

/** Public rating summary shared by Voucher and Pool identity headers. */
export function ReviewSummaryContent({
  kind,
  address,
  place,
}: {
  kind: ReviewResourceKind;
  address: string;
  place?: string | null;
}) {
  const { i18n } = useLingui();
  const reviewQuery = useReviewSummary({ kind, address });
  const reviewCount = reviewQuery.summary?.total ?? 0;
  const reviewAverage = reviewCount > 0 ? (reviewQuery.summary?.average ?? 0) : 0;
  const numberLocale = i18n.locales?.[0] ?? i18n.locale;
  const formattedAverage = new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 1,
  }).format(reviewAverage);
  const formattedReviewCount = new Intl.NumberFormat(numberLocale).format(reviewCount);

  return (
    <>
      <span className="font-mono tabular-nums">{formattedAverage}</span>
      <ReviewStars stars={reviewAverage} />
      <span className="font-mono tabular-nums">({formattedReviewCount})</span>
      {place ? (
        <>
          <span aria-hidden="true">·</span>
          <span dir="auto" className="min-w-0 truncate">
            {place}
          </span>
        </>
      ) : null}
    </>
  );
}
