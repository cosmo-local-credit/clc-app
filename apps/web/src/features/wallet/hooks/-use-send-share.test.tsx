import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { createSendShareMock } = vi.hoisted(() => ({
  createSendShareMock: vi.fn(),
}));

vi.mock("#/features/wallet/api/send-share-client", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createSendShare: createSendShareMock };
});

import { useCreateSendShare } from "./use-send-share";

const TX_HASH = `0x${"11".repeat(32)}`;
const DETAIL_QUERY_KEY = ["wallet", "send-share", "detail", TX_HASH.toLowerCase()] as const;

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCreateSendShare", () => {
  it("invalidates the authoritative detail query after the summary-only POST", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(DETAIL_QUERY_KEY, null);
    createSendShareMock.mockResolvedValue({ shareId: 1, txHash: TX_HASH });

    const { result } = renderHook(() => useCreateSendShare(TX_HASH), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.mutateAsync({ permission: 1, note: "Thanks" });
    });

    expect(queryClient.getQueryData(DETAIL_QUERY_KEY)).toBeNull();
    expect(queryClient.getQueryState(DETAIL_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});
