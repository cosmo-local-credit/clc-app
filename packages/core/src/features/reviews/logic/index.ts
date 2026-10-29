export const REVIEW_TEXT_LIMIT = 2000;
export const REVIEW_STARS = [5, 4, 3, 2, 1] as const;

export type ReviewResourceKind = "voucher" | "pool";

export type ReviewTarget = {
  kind: ReviewResourceKind;
  address: string;
};

/** Public DTOs deliberately contain no reviewer identity or transaction metadata. */
export type Review = {
  id: number;
  stars: number;
  comment: string;
  reply: string | null;
};

export type ReviewPage = {
  reviews: Review[];
  counts: Record<number, number>;
  total: number;
  average: number;
  next: number | null;
};

/** Returned only for the authenticated viewer; never mix into a public cache. */
export type ReviewAccess = {
  isOwner: boolean;
  editableUntil: string | null;
  review: Review | null;
  hidden: boolean;
  editableReplyIds: number[];
  flaggedReviewIds: number[];
};

export function canWriteReview(access: ReviewAccess, now = Date.now()): boolean {
  return (
    !access.isOwner &&
    !access.hidden &&
    !!access.editableUntil &&
    now < Date.parse(access.editableUntil)
  );
}
