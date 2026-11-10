import type { Message } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

const mocks = vi.hoisted(() => ({ send: vi.fn(), upload: vi.fn() }));

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: { send: mocks.send } }));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: true }));

import { MessageComposer } from "./message-composer";

function sent(body: string): Message {
  return {
    id: 9,
    conversationId: 5,
    clientId: "00000000-0000-4000-8000-000000000009",
    sender: "self",
    body,
    imageUrls: [],
    createdAt: "2026-11-09T10:00:00Z",
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MessageComposer conversationId={5} />
    </QueryClientProvider>,
  );
}

function attachPhoto() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("the composer offers no file input");
  const file = new File([new Uint8Array(8)], "photo.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  mocks.send.mockReset();
  mocks.upload.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("MessageComposer", () => {
  it("will not send the text alone while a photo has failed to upload", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("storage down"));
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Here is the receipt" },
    });
    attachPhoto();
    expect(
      await screen.findByText("The photo didn't upload. Remove it and try again."),
    ).toBeTruthy();

    const sendButton = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
    fireEvent.submit(sendButton.closest("form") as HTMLFormElement);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Photos to send" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByText("The photo didn't upload. Remove it and try again.")).toBeNull();
    mocks.send.mockResolvedValueOnce(sent("Here is the receipt"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ body: "Here is the receipt" }),
      ),
    );
  });
});
