import { describe, expect, it } from "vite-plus/test";
import { canWriteReview, type ReviewAccess } from "./index";

const access: ReviewAccess = {
  isOwner: false,
  hidden: false,
  editableUntil: "2026-10-06T12:00:00Z",
  review: null,
  editableReplyIds: [],
  flaggedReviewIds: [],
};
describe("review eligibility", () => {
  it("locks at the exact deadline and reopens after another redemption", () => {
    const deadline = Date.parse(access.editableUntil!);
    expect(canWriteReview(access, deadline - 1)).toBe(true);
    expect(canWriteReview(access, deadline)).toBe(false);
    expect(canWriteReview({ ...access, editableUntil: "2026-10-07T12:00:00Z" }, deadline)).toBe(
      true,
    );
  });
  it("rejects self-reviews, moderated reviews, and missing or invalid dates", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    for (const change of [
      { isOwner: true },
      { hidden: true },
      { editableUntil: null },
      { editableUntil: "bad date" },
    ]) {
      expect(canWriteReview({ ...access, ...change }, now)).toBe(false);
    }
  });
});
