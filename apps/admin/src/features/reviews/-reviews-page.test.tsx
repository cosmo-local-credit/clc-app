import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({ listReviewNotifications: vi.fn(), resolveReviewFlag: vi.fn() }));
vi.mock("#/lib/api", () => ({ clcApi: { admin: api } }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { ReviewsPage } from "./reviews-page";

beforeEach(() => {
  vi.resetAllMocks();
  api.listReviewNotifications.mockResolvedValue({
    notifications: [
      {
        id: 7,
        reviewId: 3,
        voucherAddress: "0x0000000000000000000000000000000000000001",
        reason: "Abusive language",
        stars: 4,
        comment: "Edited review text",
        reportedStars: 1,
        reportedComment: "Original reported text",
        createdAt: "2026-10-25T10:00:00Z",
      },
    ],
    next: null,
  });
  api.resolveReviewFlag.mockResolvedValue(undefined);
});

describe("ReviewsPage", () => {
  it("shows both the reported snapshot and the current review before moderation", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewsPage search={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Original reported text")).toBeTruthy();
    expect(screen.getByText("Edited review text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(
      await screen.findByText(
        "Dismissing leaves the review visible and resolves every open flag on it.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" }).at(-1)!);
    await waitFor(() => expect(api.resolveReviewFlag).toHaveBeenCalledWith(7, "dismiss"));
  });
});
