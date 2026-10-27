import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  listReviewNotifications: vi.fn(),
  resolveReviewFlag: vi.fn(),
  navigate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
const api = state;
vi.mock("#/lib/api", () => ({ clcApi: { admin: state } }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));

import { parseReviewSearch, ReviewsPage } from "./reviews-page";

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
  it("canonicalizes only positive safe pagination cursors", () => {
    expect(parseReviewSearch({ before: "7" })).toEqual({ before: 7 });
    expect(parseReviewSearch({ before: 0 })).toEqual({});
    expect(parseReviewSearch({ before: "bad" })).toEqual({});
  });

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
    expect(state.success).toHaveBeenCalledWith("Flag dismissed");
  });

  it("hides a reported review and reports mutation failures", async () => {
    api.resolveReviewFlag.mockRejectedValueOnce(new Error("moderation unavailable"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewsPage search={{}} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Hide" }));
    expect(
      await screen.findByText("Hiding removes the review and resolves every open flag on it."),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Hide" }).at(-1)!);
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("moderation unavailable"));
  });

  it("navigates between the first and older review pages", async () => {
    api.listReviewNotifications.mockResolvedValue({
      notifications: [
        {
          id: 7,
          reviewId: 3,
          voucherAddress: "0x0000000000000000000000000000000000000001",
          reason: "Spam",
          stars: 4,
          comment: "Current",
          reportedStars: 1,
          reportedComment: "Reported",
          createdAt: "2026-10-25T10:00:00Z",
        },
      ],
      next: 5,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewsPage search={{ before: 10 }} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(state.navigate).toHaveBeenCalledWith({ to: "/reviews", search: {} });
    expect(state.navigate).toHaveBeenCalledWith({ to: "/reviews", search: { before: 5 } });
  });
});
