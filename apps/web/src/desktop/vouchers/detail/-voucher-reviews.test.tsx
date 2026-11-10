import type { ReviewAccess, ReviewPage } from "@clc/core/features/reviews/logic";
import { activateLocale } from "@clc/i18n/index";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

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

import { VoucherReviewsDesk } from "./voucher-reviews";

const page: ReviewPage = {
  reviews: [],
  counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  average: 0,
  total: 0,
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

afterEach(() => activateLocale("en"));

describe("the desktop review editor", () => {
  it("writes the review window's end in the app's language", async () => {
    mocks.list.mockResolvedValue(page);
    mocks.access.mockResolvedValue(access);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VoucherReviewsDesk address="0x2222222222222222222222222222222222222222" layout="page" />
      </QueryClientProvider>,
    );
    const write = await screen.findByRole("button", { name: "Write a review" });
    await activateLocale("de");
    fireEvent.click(write);
    const dialog = await screen.findByRole("dialog");
    const until = new Intl.DateTimeFormat("de", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(access.editableUntil!));
    expect(within(dialog).getByText((text) => text.includes(until))).toBeTruthy();
  });
});

describe("a pool's reviews", () => {
  const pool = "0x3333333333333333333333333333333333333333";

  afterEach(() => {
    mocks.auth.isAuthenticated = true;
  });

  function mountPool() {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VoucherReviewsDesk kind="pool" address={pool} layout="page" />
      </QueryClientProvider>,
    );
  }

  it("reads the pool's reviews and words the window for a swap", async () => {
    mocks.list.mockResolvedValue({
      ...page,
      reviews: [{ id: 4, stars: 4, comment: "Fair rates", reply: null }],
      counts: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
      average: 4,
      total: 1,
    });
    mocks.access.mockResolvedValue({ ...access, editableUntil: null });
    mountPool();

    expect(await screen.findByRole("article", { name: "Pool review" })).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledWith(
      { kind: "pool", address: pool },
      expect.anything(),
      expect.anything(),
    );
    expect(
      await screen.findByText("Swap in this pool to leave a review within seven days."),
    ).toBeTruthy();
    expect(screen.queryByText(/Redeem this voucher/)).toBeNull();
  });

  it("asks a guest to swap in the pool, not to redeem a voucher", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.list.mockResolvedValue(page);
    mountPool();

    expect(
      await screen.findByText("Sign in after swapping in this pool to leave a review."),
    ).toBeTruthy();
  });
});

describe("a review an admin hid", () => {
  it("says so and keeps the hidden review out of the list", async () => {
    mocks.list.mockResolvedValue({
      ...page,
      reviews: [{ id: 3, stars: 5, comment: "Lovely produce", reply: null }],
      counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
      average: 5,
      total: 1,
    });
    mocks.access.mockResolvedValue({
      ...access,
      hidden: true,
      review: { id: 8, stars: 2, comment: "Hidden words", reply: null },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VoucherReviewsDesk address="0x2222222222222222222222222222222222222222" layout="page" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Lovely produce")).toBeTruthy();
    expect(screen.getByText("Your review was hidden by an admin.")).toBeTruthy();
    expect(screen.queryByText("Hidden words")).toBeNull();
    expect(screen.queryByText("Your review")).toBeNull();
  });
});
