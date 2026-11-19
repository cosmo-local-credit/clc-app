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

  it("reuses the client id when a failed draft is sent again", async () => {
    mocks.reply
      .mockRejectedValueOnce(new BackendApiError(400, "invalid"))
      .mockResolvedValueOnce(message(12, "Retried"));
    const { result } = mount(() => useOperatorHelpdeskReply(21));
    act(() => result.current.setBody("Retry this"));
    await waitFor(() => expect(result.current.canSend).toBe(true));
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.send.isError).toBe(true));
    const firstClientId = mocks.reply.mock.calls[0]?.[1].clientId;

    act(() => result.current.submit());
    await waitFor(() => expect(result.current.send.isSuccess).toBe(true));
    expect(mocks.reply.mock.calls[1]?.[1].clientId).toBe(firstClientId);
  });

  it("keeps a draft edited while its earlier reply is pending", async () => {
    let resolveReply: ((value: ReturnType<typeof message>) => void) | undefined;
    mocks.reply.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof message>>((resolve) => {
          resolveReply = resolve;
        }),
    );
    const { result } = mount(() => useOperatorHelpdeskReply(21));
    act(() => result.current.setBody("First draft"));
    await waitFor(() => expect(result.current.canSend).toBe(true));
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.send.isPending).toBe(true));
    act(() => {
      result.current.submit();
      result.current.setBody("Edited draft");
    });
    act(() => resolveReply?.(message(13, "First draft")));
    await waitFor(() => expect(result.current.send.isSuccess).toBe(true));
    expect(result.current.body).toBe("Edited draft");
    expect(mocks.reply).toHaveBeenCalledTimes(1);
  });

  it("does not clear a draft when the mutation was invoked directly", async () => {
    const { result } = mount(() => useOperatorHelpdeskReply(21));
    act(() => result.current.setBody("Keep me"));
    act(() =>
      result.current.send.mutate({
        body: "Direct reply",
        clientId: "00000000-0000-4000-8000-000000000099",
      }),
    );
    await waitFor(() => expect(result.current.send.isSuccess).toBe(true));
    expect(result.current.body).toBe("Keep me");
  });

  it("ignores empty, uploading, and failed submissions", async () => {
    let resolveUpload: ((value: { url: string }) => void) | undefined;
    mocks.upload.mockImplementationOnce(
      () =>
        new Promise<{ url: string }>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const { result } = mount(() => useOperatorHelpdeskReply(21));
    act(() => result.current.submit());
    expect(mocks.reply).not.toHaveBeenCalled();

    act(() => result.current.setBody("Wait for upload"));
    const photo = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });
    let uploadPromise: Promise<void> | undefined;
    act(() => {
      uploadPromise = result.current.addImage(photo);
    });
    await waitFor(() => expect(result.current.uploading).toBe(true));
    act(() => result.current.submit());
    expect(mocks.reply).not.toHaveBeenCalled();
    await act(async () => {
      resolveUpload?.({ url: "https://storage.example/photo.jpg" });
      await uploadPromise;
    });

    mocks.upload.mockRejectedValueOnce(new Error("storage down"));
    await act(() => result.current.addImage(photo));
    act(() => result.current.submit());
    expect(mocks.reply).not.toHaveBeenCalled();
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

  it("updates the intended image, enforces the image limit, and ignores unknown removals", async () => {
    const { result } = mount(() => useOperatorHelpdeskReply(21));
    const photo = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });
    for (let index = 0; index < 4; index += 1) {
      await act(() => result.current.addImage(photo));
    }
    expect(result.current.images).toHaveLength(4);
    expect(mocks.upload).toHaveBeenCalledTimes(4);

    await act(() => result.current.addImage(photo));
    expect(mocks.upload).toHaveBeenCalledTimes(4);
    act(() => result.current.removeImage("missing"));
    expect(result.current.images).toHaveLength(4);
  });
});
