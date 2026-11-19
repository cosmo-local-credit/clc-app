import { BackendApiError } from "@clc/api/client/errors";
import { adminMessagingKeys } from "@clc/api/features/messaging/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  counts: vi.fn(),
  queue: vi.fn(),
  item: vi.fn(),
  messages: vi.fn(),
  reply: vi.fn(),
  setStatus: vi.fn(),
  upload: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("#/lib/api/messaging", () => ({
  adminMessagingClient: {
    counts: mocks.counts,
    helpdeskQueue: mocks.queue,
    helpdeskItem: mocks.item,
    helpdeskMessages: mocks.messages,
    reply: mocks.reply,
    setHelpdeskStatus: mocks.setStatus,
  },
}));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));

import { useOperatorHelpdeskReply, useOperatorHelpdeskThread } from "./use-operator-helpdesk";

const USER = "0x1111111111111111111111111111111111111111";
const ADMIN = "0x2222222222222222222222222222222222222222";

function helpdeskItem(status: "open" | "resolved" = "open") {
  return {
    id: 21,
    status,
    user: { address: USER, username: "amina", avatar: null },
    lastMessage: null,
    lastMessageAt: "2026-11-09T10:00:00Z",
    needsReply: status === "open",
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T10:00:00Z",
  } as const;
}

function message(id: number, body: string) {
  return {
    id,
    conversationId: 21,
    clientId: `00000000-0000-4000-8000-${id.toString().padStart(12, "0")}`,
    sender: "support" as const,
    adminAddress: ADMIN,
    body,
    imageUrls: [],
    createdAt: "2026-11-09T10:00:00Z",
  };
}

function mount<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), client };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.item.mockResolvedValue(helpdeskItem());
  mocks.messages.mockResolvedValue({ items: [message(10, "Newest")], hasMore: true });
  mocks.reply.mockResolvedValue(message(11, "Reply"));
  mocks.setStatus.mockResolvedValue(helpdeskItem("resolved"));
  mocks.upload.mockResolvedValue({ url: "https://storage.example/photo.jpg" });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = mocks.revoke;
});

describe("useOperatorHelpdeskThread", () => {
  it("loads older messages and updates the cached status", async () => {
    mocks.messages
      .mockResolvedValueOnce({ items: [message(10, "Newest")], hasMore: true })
      .mockResolvedValueOnce({ items: [message(9, "Older")], hasMore: false });
    const { result, client } = mount(() => useOperatorHelpdeskThread(21));
    await waitFor(() => expect(result.current.messages.isSuccess).toBe(true));

    act(() => result.current.loadOlder.mutate());
    await waitFor(() => expect(result.current.loadOlder.isSuccess).toBe(true));
    expect(mocks.messages).toHaveBeenLastCalledWith(21, { before: 10, limit: 50 });

    act(() => result.current.setStatus.mutate("resolved"));
    await waitFor(() => expect(result.current.setStatus.isSuccess).toBe(true));
    expect(client.getQueryData(adminMessagingKeys.helpdeskItem(21))).toEqual(
      helpdeskItem("resolved"),
    );
  });
});

describe("useOperatorHelpdeskReply", () => {
  it("sends once, appends the response and clears the unchanged draft", async () => {
    const { result, client } = mount(() => useOperatorHelpdeskReply(21));
    act(() => result.current.setBody("Reply"));
    await waitFor(() => expect(result.current.canSend).toBe(true));
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.send.isSuccess).toBe(true));
    expect(mocks.reply).toHaveBeenCalledWith(21, {
      body: "Reply",
      clientId: expect.any(String),
    });
    expect(result.current.body).toBe("");
    expect(client.getQueryData(adminMessagingKeys.helpdeskMessages(21))).toMatchObject({
      items: [expect.objectContaining({ id: 11 })],
    });
  });

  it("keeps the draft after a non-retryable send failure", async () => {
    mocks.reply.mockRejectedValue(new BackendApiError(400, "invalid"));
    const { result } = mount(() => useOperatorHelpdeskReply(21));
    act(() => result.current.setBody("Keep this"));
    await waitFor(() => expect(result.current.canSend).toBe(true));
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.send.isError).toBe(true));
    expect(result.current.body).toBe("Keep this");
    expect(mocks.reply).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported images and handles successful and failed uploads", async () => {
    const { result, unmount } = mount(() => useOperatorHelpdeskReply(21));
    const unsupported = new File(["gif"], "photo.gif", { type: "image/gif" });
    await act(() => result.current.addImage(unsupported));
    expect(result.current.imageError).toBe("unsupported");
    expect(mocks.upload).not.toHaveBeenCalled();

    const photo = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });
    await act(() => result.current.addImage(photo));
    expect(result.current.images[0]).toMatchObject({
      previewUrl: "blob:preview",
      url: "https://storage.example/photo.jpg",
      failed: false,
    });
    expect(result.current.canSend).toBe(true);

    act(() => result.current.removeImage(result.current.images[0]!.key));
    expect(result.current.images).toEqual([]);
    expect(mocks.revoke).toHaveBeenCalledWith("blob:preview");

    mocks.upload.mockRejectedValueOnce(new Error("storage down"));
    await act(() => result.current.addImage(photo));
    expect(result.current.imageError).toBe("upload-failed");
    expect(result.current.canSend).toBe(false);
    unmount();
    expect(mocks.revoke).toHaveBeenCalledTimes(2);
  });
});
