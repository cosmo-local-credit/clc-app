import type { ReviewAccess } from "@clc/core/features/reviews/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  access: vi.fn<() => Promise<ReviewAccess>>(),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    address: "0x1111111111111111111111111111111111111111",
  }),
}));

vi.mock("#/lib/api/reviews", () => ({
  reviewsClient: { access: mocks.access },
}));

import { useResourceReviewAccess } from "./use-voucher-reviews";

beforeEach(() => {
  mocks.access.mockReset().mockResolvedValue({
    isOwner: false,
    editableUntil: null,
    review: null,
    hidden: false,
    editableReplyIds: [],
    flaggedReviewIds: [],
  });
});

describe("useResourceReviewAccess", () => {
  it("polls while an indexed Pool swap is still becoming reviewable", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = renderHook(
      () =>
        useResourceReviewAccess(
          { kind: "pool", address: "0x2222222222222222222222222222222222222222" },
          true,
        ),
      { wrapper },
    );

    await waitFor(() => expect(view.result.current.access.data).toBeTruthy());
    expect(mocks.access).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
