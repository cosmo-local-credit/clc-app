import type { Message } from "@clc/core/features/messaging/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

const mocks = vi.hoisted(() => {
  // Read once at module load by #/lib/api/storage, which this file does not mock.
  vi.stubEnv("VITE_STORAGE_URL", "");
  return { send: vi.fn() };
});

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER, session: { address: VIEWER } }),
}));
vi.mock("#/lib/api/messaging", () => ({ messagingClient: { send: mocks.send } }));

import { MessageComposer } from "./message-composer";

describe("MessageComposer without VITE_STORAGE_URL", () => {
  it("renders without the photo button and still sends text", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MessageComposer conversationId={5} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "Add a photo" })).toBeNull();

    const message: Message = {
      id: 9,
      conversationId: 5,
      clientId: "00000000-0000-4000-8000-000000000009",
      sender: "self",
      body: "Hello",
      imageUrls: [],
      createdAt: "2026-11-09T10:00:00Z",
    };
    mocks.send.mockResolvedValueOnce(message);
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(5, expect.objectContaining({ body: "Hello" })),
    );
  });
});
