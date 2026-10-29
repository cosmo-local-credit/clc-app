import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  summary: undefined as { total: number; average: number } | undefined,
}));

vi.mock("#/features/reviews/hooks/use-voucher-reviews", () => ({
  useReviewSummary: () => ({ summary: mocks.summary }),
}));

import { ReviewSummaryContent } from "./review-summary";

describe("ReviewSummaryContent", () => {
  beforeEach(() => {
    mocks.summary = undefined;
  });

  it("shows zero with five empty stars while reviews are absent", () => {
    render(<ReviewSummaryContent kind="pool" address="0xPool" />);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("(0)")).toBeTruthy();
    expect(screen.getByLabelText("0 out of 5 stars")).toBeTruthy();
  });

  it("formats half-star Pool summaries and their review count", () => {
    mocks.summary = { total: 2, average: 4.5 };
    render(<ReviewSummaryContent kind="pool" address="0xPool" />);
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText("(2)")).toBeTruthy();
    expect(screen.getByLabelText("4.5 out of 5 stars")).toBeTruthy();
  });
});
