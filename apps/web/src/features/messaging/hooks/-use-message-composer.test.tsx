import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222" as const;
const FIRST = "0x3333333333333333333333333333333333333333" as const;
const SECOND = "0x4444444444444444444444444444444444444444" as const;
const mocks = vi.hoisted(() => ({ send: vi.fn(), upload: vi.fn() }));

vi.mock("./use-messaging-viewer", () => ({ useMessagingViewer: () => VIEWER }));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: { send: mocks.send } }));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));

import { useMessageComposer } from "./use-message-composer";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({
    id: 1,
    conversationId: 5,
    clientId: "00000000-0000-4000-8000-000000000001",
    sender: "self",
    body: "Hello",
    imageUrls: [],
    context: null,
    createdAt: "2026-11-19T00:00:00Z",
  });
});

describe("useMessageComposer resource context", () => {
  it("adopts a changed context, updates its proposal, and clears it explicitly", () => {
    const onContextSent = vi.fn();
    const initial = { kind: "pool" as const, resourceId: POOL };
    const { result, rerender } = renderHook(
      ({ context }) => useMessageComposer(5, context, onContextSent),
      { wrapper, initialProps: { context: initial } },
    );

    act(() => result.current.setProposedVoucher(FIRST));
    expect(result.current.context).toEqual({ ...initial, proposedVoucherAddress: FIRST });

    const replacement = { ...initial, proposedVoucherAddress: SECOND };
    rerender({ context: replacement });
    expect(result.current.context).toEqual(replacement);

    act(() => result.current.clearContext());
    expect(result.current.context).toBeUndefined();
    expect(onContextSent).toHaveBeenCalledOnce();
  });

  it("keeps non-Pool context unchanged when a proposal is selected", () => {
    const context = { kind: "want" as const, resourceId: "want-1" };
    const { result } = renderHook(() => useMessageComposer(5, context), { wrapper });
    act(() => result.current.setProposedVoucher(FIRST));
    expect(result.current.context).toEqual(context);
  });

  it("sends text and context together and clears the adopted context after success", async () => {
    const onContextSent = vi.fn();
    const context = { kind: "pool" as const, resourceId: POOL };
    const { result } = renderHook(() => useMessageComposer(5, context, onContextSent), { wrapper });
    act(() => result.current.setBody("Hello"));
    act(() => result.current.submit());

    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ body: "Hello", context }),
      ),
    );
    await waitFor(() => expect(result.current.context).toBeUndefined());
    expect(onContextSent).toHaveBeenCalledOnce();
  });
});
