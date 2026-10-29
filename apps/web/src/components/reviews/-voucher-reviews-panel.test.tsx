import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReviewAccess, ReviewPage } from "@clc/core/features/reviews/logic";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  access: vi.fn(),
  save: vi.fn(),
  reply: vi.fn(),
  flag: vi.fn(),
  auth: { isAuthenticated: true, address: "0x1111111111111111111111111111111111111111" },
}));
vi.mock("#/lib/api/reviews", () => ({ reviewsClient: mocks }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
import { PoolReviewsPanel, VoucherReviewsPanel } from "./voucher-reviews-panel";

const review = { id: 8, stars: 5, comment: "Lovely produce", reply: null };
const page: ReviewPage = {
  reviews: [review],
  counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
  average: 5,
  total: 1,
  next: null,
};
const access: ReviewAccess = {
  isOwner: false,
  hidden: false,
  editableUntil: "2099-10-06T12:00:00Z",
  review: null,
  editableReplyIds: [],
  flaggedReviewIds: [],
};

function mount(kind: "voucher" | "pool" = "voucher") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {kind === "voucher" ? (
        <VoucherReviewsPanel address="0x2222222222222222222222222222222222222222" />
      ) : (
        <PoolReviewsPanel address="0x2222222222222222222222222222222222222222" />
      )}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.list.mockResolvedValue(page);
  mocks.access.mockResolvedValue(access);
  mocks.save.mockResolvedValue({ saved: true });
  mocks.reply.mockResolvedValue({ saved: true });
  mocks.flag.mockResolvedValue({ saved: true });
});

describe("voucher reviews", () => {
  it("shows a simple empty state without ratings or sorting when no reviews exist", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.list.mockResolvedValue({
      reviews: [],
      counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      average: 0,
      total: 0,
      next: null,
    });
    mount();
    expect(await screen.findByText("No reviews yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Ratings distribution")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(
      screen.getByText("Sign in after redeeming this voucher to leave a review."),
    ).toBeTruthy();
  });

  it("lets an eligible redeemer write the first review", async () => {
    mocks.list.mockResolvedValue({
      reviews: [],
      counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      average: 0,
      total: 0,
      next: null,
    });
    mount();
    expect(await screen.findByText("No reviews yet.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Write a review" }));
    expect(screen.getByRole("radio", { name: "5 stars" })).toBeTruthy();
  });

  it("shows a load error instead of claiming there are no reviews", async () => {
    mocks.list.mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load reviews.")).toBeTruthy();
    expect(screen.queryByText("No reviews yet.")).toBeNull();
  });

  it("retries failed reviews and review-access requests", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(page);
    mocks.access.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(access);
    mount();

    const retries = await screen.findAllByRole("button", { name: "Try again" });
    for (const retry of retries) fireEvent.click(retry);

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.access).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Lovely produce")).toBeTruthy();
  });

  it("shows anonymous public cards and filters by histogram without hiding the summary", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.list.mockImplementation((_target, params) =>
      Promise.resolve(params.stars === 1 ? { ...page, reviews: [] } : page),
    );
    const view = mount();
    const card = await screen.findByRole("article");
    expect(within(card).getByText("Lovely produce")).toBeTruthy();
    expect(view.container.textContent).not.toContain(mocks.auth.address);
    expect(mocks.access).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show 1-star reviews" }));
    expect(await screen.findByText("No reviews with this rating.")).toBeTruthy();
    expect(screen.getByText("5.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(await screen.findByText("Lovely produce")).toBeTruthy();
  });

  it("requires a star selection and sends the review without an author field", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Write a review" }));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "  Good service  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        { kind: "voucher", address: expect.any(String) },
        4,
        "Good service",
      ),
    );
  });

  it("locks an existing review after its window expires", async () => {
    mocks.access.mockResolvedValue({
      ...access,
      editableUntil: "2020-01-01T00:00:00Z",
      review,
    });
    mount();
    expect(
      await screen.findByText("Redeem this voucher again to update your review."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit your review" })).toBeNull();
  });

  it("lets owners edit only their own replies and report other reviews", async () => {
    mocks.access.mockResolvedValue({ ...access, isOwner: true, editableReplyIds: [8] });
    mocks.list.mockResolvedValue({
      ...page,
      reviews: [
        { ...review, reply: "Thank you" },
        { ...review, id: 9, comment: "Another", reply: "Previous owner's reply" },
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit your reply" }));
    expect(screen.getAllByRole("button", { name: "Edit your reply" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Write a review" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "Thanks again" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.reply).toHaveBeenCalledWith(
        { kind: "voucher", address: expect.any(String) },
        8,
        "Thanks again",
      ),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Report inappropriate" })[0]!);
    fireEvent.change(screen.getByLabelText("Reason for reporting"), {
      target: { value: "Contains private information" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(mocks.flag).toHaveBeenCalledWith(
        { kind: "voucher", address: expect.any(String) },
        8,
        "Contains private information",
      ),
    );
  });

  it("retains the draft and exposes a retry after a failed save", async () => {
    mocks.save.mockRejectedValue(new Error("offline"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Write a review" }));
    fireEvent.click(screen.getByRole("radio", { name: "3 stars" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Comment (optional)") as HTMLTextAreaElement).value).toBe(
      "Keep this draft",
    );
  });

  it("uses Pool eligibility copy and isolated Pool API paths", async () => {
    mocks.auth.isAuthenticated = false;
    mount("pool");
    expect(
      await screen.findByText("Sign in after swapping in this pool to leave a review."),
    ).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledWith(
      { kind: "pool", address: "0x2222222222222222222222222222222222222222" },
      { stars: undefined, before: undefined },
      expect.any(AbortSignal),
    );
  });

  it("writes an eligible Pool review through the Pool endpoint", async () => {
    mount("pool");
    fireEvent.click(await screen.findByRole("button", { name: "Write a review" }));
    fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "Fast and fair" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        { kind: "pool", address: "0x2222222222222222222222222222222222222222" },
        5,
        "Fast and fair",
      ),
    );
  });
});
