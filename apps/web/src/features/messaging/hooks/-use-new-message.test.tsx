import { BackendApiError } from "@clc/api/client/errors";
import type { RecipientIdentity } from "@clc/api/features/recipients/client";
import type { Conversation } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const mocks = vi.hoisted(() => ({ list: vi.fn(), request: vi.fn() }));

vi.mock("./use-messaging-viewer", () => ({
  useMessagingViewer: () => VIEWER,
}));
vi.mock("#/features/wallet/hooks/use-recipient-resolution", () => ({
  useRecipientSearch: () => ({ data: [], isDebouncing: false, isFetching: false }),
}));
vi.mock("@clc/api/features/safe/queries", () => ({
  ownerInfoQueryOptions: (_client: unknown, address?: string) => ({
    queryKey: ["owner", address ?? "none"],
    queryFn: async () => ({ messageTargets: [] }),
    enabled: Boolean(address),
  }),
}));
vi.mock("#/lib/api/safe", () => ({ safeClient: {} }));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: mocks }));

import { useNewMessage } from "./use-new-message";

const recipient = {
  kind: "user" as const,
  name: "Pool owner",
  alias: "pool-owner",
  address: OWNER,
  chainId: 100,
} satisfies RecipientIdentity;
const context = {
  kind: "pool" as const,
  resourceId: "0x3333333333333333333333333333333333333333" as const,
  proposedVoucherAddress: "0x4444444444444444444444444444444444444444" as const,
};

function mount(openThread = vi.fn(), initialContext?: Parameters<typeof useNewMessage>[2]) {
  const client = new QueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return {
    ...renderHook(() => useNewMessage(openThread, OWNER, initialContext), { wrapper }),
    openThread,
  };
}

function threadPage(status: Conversation["status"], blocked = false) {
  return {
    items: [{ id: 7, kind: "direct", status, blocked, peer: { address: OWNER } }],
    nextCursor: null,
  };
}

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mocks.request.mockReset();
});

describe("useNewMessage", () => {
  it("opens an older accepted thread without relying on the inbox or posting a request", async () => {
    mocks.list.mockResolvedValue(threadPage("accepted"));
    const { result, openThread } = mount();

    act(() => result.current.choose(recipient, context));

    expect(result.current.lookupStatus).toBe("pending");
    expect(mocks.list).toHaveBeenCalledWith(
      { kind: "direct", peerAddress: OWNER },
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(openThread).toHaveBeenCalledWith(7, context));
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("retains late resource context while preparing a new request", async () => {
    mocks.request.mockResolvedValue({ id: 9 });
    const { result, openThread } = mount();

    act(() => result.current.choose(recipient, context));

    await waitFor(() => expect(result.current.selected).toEqual(recipient));
    expect(result.current.context).toEqual(context);

    act(() => result.current.submit());
    await waitFor(() => expect(openThread).toHaveBeenCalledWith(9));
    expect(mocks.request).toHaveBeenCalledWith({ recipientAddress: OWNER, context });
  });

  it.each([
    { status: "pending", blocked: false },
    { status: "accepted", blocked: true },
  ] as const)(
    "opens a $status thread with blocked=$blocked without a new attachment",
    async ({ status, blocked }) => {
      mocks.list.mockResolvedValue(threadPage(status, blocked));
      const { result, openThread } = mount();

      act(() => result.current.choose(recipient, context));

      await waitFor(() => expect(openThread).toHaveBeenCalledWith(7, undefined));
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );

  it("waits for a successful lookup, then retries the same recipient and context", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    const { result } = mount();

    act(() => result.current.choose(recipient, context));
    await waitFor(() => expect(result.current.lookupStatus).toBe("error"));
    act(() => result.current.submit());
    expect(mocks.request).not.toHaveBeenCalled();

    act(() => result.current.retryLookup());
    await waitFor(() => expect(result.current.selected).toEqual(recipient));
    expect(result.current.context).toEqual(context);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("cancels the pending lookup when switching recipients or closing", async () => {
    mocks.list.mockImplementation(() => new Promise(() => {}));
    const { result, openThread } = mount();

    act(() => result.current.choose(recipient, context));
    const firstSignal = mocks.list.mock.calls[0]?.[1] as AbortSignal;
    act(() => result.current.choose({ ...recipient, address: context.resourceId }));
    const secondSignal = mocks.list.mock.calls[1]?.[1] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);

    act(() => result.current.reset());
    expect(secondSignal.aborted).toBe(true);
    expect(result.current.lookupStatus).toBe("idle");
    expect(openThread).not.toHaveBeenCalled();
  });

  it("rechecks a request conflict and keeps the selected proposal when opening the accepted thread", async () => {
    mocks.list
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce(threadPage("accepted"));
    mocks.request.mockRejectedValue(new BackendApiError(409, "conversation already exists"));
    const { result, openThread } = mount();

    act(() => result.current.choose(recipient, context));
    await waitFor(() => expect(result.current.selected).toEqual(recipient));
    act(() => result.current.submit());

    await waitFor(() => expect(openThread).toHaveBeenCalledWith(7, context));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("unselects a prepared recipient and can select the same person again", async () => {
    const { result } = mount();
    act(() => result.current.choose(recipient, context));
    await waitFor(() => expect(result.current.selected).toEqual(recipient));

    act(() => result.current.unselect());
    expect(result.current.selected).toBeNull();
    expect(result.current.lookupStatus).toBe("idle");

    act(() => result.current.choose(recipient, context));
    await waitFor(() => expect(result.current.selected).toEqual(recipient));
  });

  it("updates an optional Pool proposal and ignores proposals for other resources", () => {
    const { result, rerender } = mount(vi.fn(), context);
    const replacement = "0x5555555555555555555555555555555555555555" as const;
    act(() => result.current.setProposedVoucher(replacement));
    expect(result.current.context).toEqual({
      kind: "pool",
      resourceId: context.resourceId,
      proposedVoucherAddress: replacement,
    });
    act(() => result.current.setProposedVoucher());
    expect(result.current.context).toEqual({ kind: "pool", resourceId: context.resourceId });

    const want = { kind: "want" as const, resourceId: "want-1" };
    const other = mount(vi.fn(), want);
    act(() => other.result.current.setProposedVoucher(replacement));
    expect(other.result.current.context).toEqual(want);
    rerender();
  });

  it("trims and submits an optional introduction", async () => {
    mocks.request.mockResolvedValue({ id: 12 });
    const { result, openThread } = mount();
    act(() => result.current.choose(recipient));
    await waitFor(() => expect(result.current.selected).toEqual(recipient));
    act(() => result.current.setIntro("  Hello there  "));
    act(() => result.current.submit());
    await waitFor(() => expect(openThread).toHaveBeenCalledWith(12));
    expect(mocks.request).toHaveBeenCalledWith({ recipientAddress: OWNER, intro: "Hello there" });
  });

  it.each([
    [404, "missing"],
    [429, "quota"],
    [500, "failed"],
  ] as const)("maps request status %s to the %s failure", async (status, expected) => {
    mocks.request.mockRejectedValue(new BackendApiError(status, "request failed"));
    const { result } = mount();
    act(() => result.current.choose(recipient));
    await waitFor(() => expect(result.current.selected).toEqual(recipient));
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.failure).toBe(expected));
  });
});
