import type { ReviewAccess } from "@clc/core/features/reviews/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  access: undefined as ReviewAccess | undefined,
  accessError: false,
  target: undefined as unknown,
  refetch: vi.fn(),
  saveReview: vi.fn(),
  tracking: { outcome: { kind: "pending" } } as unknown,
}));

vi.mock("#/features/reviews/hooks/use-voucher-reviews", () => ({
  useResourceReviewAccess: (target: unknown) => {
    mocks.target = target;
    return {
      auth: { isAuthenticated: true },
      access: {
        data: mocks.access,
        isError: mocks.accessError,
        isFetching: false,
        refetch: mocks.refetch,
      },
    };
  },
}));
vi.mock("#/lib/api/reviews", () => ({ reviewsClient: { save: mocks.saveReview } }));

// The receipt around the prompt: its pool frame, tracking and reads.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("#/desktop/pools/pool-desk", () => ({
  PoolDeskFrame: ({ side }: { side: ReactNode }) => <div>{side}</div>,
}));
vi.mock("#/features/auth/hooks/use-otx-tracking", () => ({
  useOtxTracking: () => mocks.tracking,
}));
vi.mock("#/features/home/hooks/use-market-voucher-detail", () => ({
  useMarketVoucherDetail: () => ({ data: undefined }),
}));
vi.mock("#/features/pools/hooks/use-pool-swap-settlement", () => ({
  usePoolSwapSettlement: () => ({ data: undefined, isFetching: false, isError: false }),
}));
vi.mock("@clc/api/features/relayer/client", () => ({
  createRelayerClient: () => ({ trackRelay: vi.fn() }),
}));

import { type SwapReceiptDetails, SwapReceiptDesk } from "./swap-receipt-desk";
import { PoolSwapReviewDesk } from "./swap-review-desk";

const POOL = "0x1111111111111111111111111111111111111111";
const details = {
  trackingId: "swap-tracking-1",
  sendAmount: "1.00",
  sendSymbol: "USDC",
  receiveAmount: "2.00",
  receiveSymbol: "TTX",
  poolName: "Trade Pool",
} as SwapReceiptDetails;
const confirmed = {
  outcome: {
    kind: "success",
    otx: {
      id: 1,
      trackingId: "swap-tracking-1",
      otxType: "RELAY_EXEC",
      txHash: "0x4d8ab3f71c9e052d8a7b1c6e9f0a2d3e4f5a6b7c",
      nonce: 1,
      replaced: false,
      createdAt: "2026-07-02T10:00:00Z",
      status: "SUCCESS",
    },
  },
};

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
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
  mocks.accessError = false;
  mocks.refetch.mockReset();
  mocks.saveReview.mockReset().mockResolvedValue({ saved: true });
});

describe("the desktop swap receipt", () => {
  it("invites a review of the pool once the swap confirms, and not before", () => {
    mocks.tracking = { outcome: { kind: "pending" } };
    const pending = wrap(<SwapReceiptDesk poolAddress={POOL} details={details} />);
    expect(screen.queryByRole("heading", { name: "How was your experience?" })).toBeNull();
    pending.unmount();

    mocks.tracking = confirmed;
    wrap(<SwapReceiptDesk poolAddress={POOL} details={details} />);
    expect(screen.getByRole("heading", { name: "How was your experience?" })).toBeTruthy();
    expect(mocks.target).toEqual({ kind: "pool", address: POOL });
  });
});

describe("the pool review prompt", () => {
  it("saves a review of the pool and says so", async () => {
    wrap(<PoolSwapReviewDesk poolAddress={POOL} />);
    expect(
      screen.getByText("You have seven days after the swap to write or edit your review."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.saveReview).toHaveBeenCalledWith({ kind: "pool", address: POOL }, 4, ""),
    );
    expect(await screen.findByText("Your review has been saved.")).toBeTruthy();
  });

  it("waits for the swap to be indexed before a review can be written, and Later puts it away", () => {
    mocks.access!.editableUntil = null;
    wrap(<PoolSwapReviewDesk poolAddress={POOL} />);
    expect(screen.getByText(/once this swap is processed/)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText(/once this swap is processed/)).toBeNull();
  });

  it("offers a retry when the access check fails", () => {
    mocks.accessError = true;
    wrap(<PoolSwapReviewDesk poolAddress={POOL} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't check your review access.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("asks nothing of the pool's owner", () => {
    mocks.access!.isOwner = true;
    const view = wrap(<PoolSwapReviewDesk poolAddress={POOL} />);
    expect(view.container.textContent).toBe("");
  });
});
