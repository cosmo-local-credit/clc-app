import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReviewAccess } from "@clc/core/features/reviews/logic";

const mocks = vi.hoisted(() => ({
  owner: "0x11111111111111111111111111111111111111111",
  access: undefined as ReviewAccess | undefined,
  saveReview: vi.fn(),
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: { ownerAddress: mocks.owner } }),
}));
vi.mock("#/features/reviews/hooks/use-voucher-reviews", () => ({
  useReviewAccess: () => ({ auth: { isAuthenticated: true }, access: { data: mocks.access } }),
}));
vi.mock("#/features/reviews/api/reviews-client", () => ({ saveReview: mocks.saveReview }));
import { RedemptionReviewPrompt } from "./redemption-review-prompt";

const voucher = "0x2222222222222222222222222222222222222222";
function mount(recipient = mocks.owner) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RedemptionReviewPrompt address={voucher} recipient={recipient} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.access = {
    isOwner: false,
    hidden: false,
    editableUntil: new Date(Date.now() + 86400000).toISOString(),
    review: null,
    editableReplyIds: [],
    flaggedReviewIds: [],
  };
  mocks.saveReview.mockReset().mockResolvedValue({ saved: true });
});

describe("redemption review prompt", () => {
  it("does not prompt for an ordinary send or the voucher owner's own receipt", () => {
    const view = mount(voucher);
    expect(view.container.textContent).toBe("");
    view.unmount();
    mocks.access!.isOwner = true;
    expect(mount().container.textContent).toBe("");
  });
  it("waits for indexed redemption before allowing a review", () => {
    mocks.access!.editableUntil = null;
    mount();
    expect(screen.getByText(/once this redemption is processed/)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText(/once this redemption is processed/)).toBeNull();
  });
  it("prefills and updates the existing review rather than creating another", async () => {
    mocks.access!.review = { id: 2, stars: 2, comment: "Previous experience", reply: null };
    mount();
    expect(screen.getByRole("heading", { name: "Update your review" })).toBeTruthy();
    expect((screen.getByLabelText("Comment (optional)") as HTMLTextAreaElement).value).toBe(
      "Previous experience",
    );
    fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.saveReview).toHaveBeenCalledWith(voucher, 5, "Previous experience"),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });
});
