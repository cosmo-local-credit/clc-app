import { adminMessagingKeys } from "@clc/api/features/messaging/queries";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HelpdeskThreadPage } from "./helpdesk-thread-page";
import {
  helpdeskItem,
  message,
  OPERATOR,
  OTHER_OPERATOR,
  testQueryClient,
} from "./-messaging-fixtures";
import { THREAD_POLL_MS } from "./use-helpdesk";

const mocks = vi.hoisted(() => ({
  helpdeskItem: vi.fn(),
  helpdeskMessages: vi.fn(),
  reply: vi.fn(),
  setHelpdeskStatus: vi.fn(),
  helpdeskQueue: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("#/lib/messaging", () => ({ adminMessaging: mocks }));
vi.mock("#/lib/storage", () => ({ isStorageConfigured: true }));
vi.mock("#/features/images/use-image-upload", () => ({
  useImageUpload: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock("#/features/auth/admin-session", () => ({
  useAdminSession: () => ({
    status: "authenticated",
    operator: { address: "0x3333333333333333333333333333333333333333", role: "ADMIN" },
  }),
}));

const ITEM = helpdeskItem(7);
const OPENING = [
  message(10, { body: "My withdrawal is stuck" }),
  message(11, { sender: "support", adminAddress: OTHER_OPERATOR, body: "Which phone number?" }),
  message(12, { body: "+254700000000" }),
];

function mount(client: QueryClient = testQueryClient()) {
  const root = createRootRoute({ component: Outlet });
  const queue = createRoute({
    getParentRoute: () => root,
    path: "/helpdesk",
    component: () => <p>queue</p>,
  });
  const thread = createRoute({
    getParentRoute: () => root,
    path: "/helpdesk/$conversationId",
    component: () => (
      <HelpdeskThreadPage conversationId={useParams({ strict: false }).conversationId ?? ""} />
    ),
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: "/users/$address",
    component: () => <p>account</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([queue, thread, account]),
    history: createMemoryHistory({ initialEntries: ["/helpdesk/7"] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

function typeReply(text: string) {
  fireEvent.change(screen.getByLabelText("Reply", { selector: "textarea" }), {
    target: { value: text },
  });
}

function sendButton() {
  return screen.getByRole("button", { name: "Send reply" }) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.helpdeskItem.mockResolvedValue(ITEM);
  mocks.helpdeskMessages.mockImplementation((_id: number, params: { after?: number }) =>
    Promise.resolve(
      params.after === undefined
        ? { items: OPENING, hasMore: false }
        : { items: [], hasMore: false },
    ),
  );
  mocks.helpdeskQueue.mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("helpdesk thread", () => {
  it("shows the user's messages and support's, with the replying admin", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "amina" })).toBeTruthy();
    expect(await screen.findByText("My withdrawal is stuck")).toBeTruthy();
    const support = screen.getByRole("listitem", { name: "Support message 11" });
    expect(within(support).getByText("Support")).toBeTruthy();
    expect(within(support).getByTitle(OTHER_OPERATOR)).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "User message 12" })).toBeTruthy();
    expect(mocks.helpdeskMessages).toHaveBeenCalledWith(7, { limit: 50 }, expect.any(AbortSignal));
  });

  it("keeps one clientId across a failed send and its retry, and a new one for the next reply", async () => {
    mount();
    await screen.findByText("My withdrawal is stuck");
    mocks.reply.mockRejectedValueOnce(new Error("Network down."));
    typeReply("  We are on it  ");
    fireEvent.click(sendButton());

    expect(await screen.findByText(/Could not send: Network down\./)).toBeTruthy();
    // The draft survives the failure.
    expect(
      (screen.getByLabelText("Reply", { selector: "textarea" }) as HTMLTextAreaElement).value,
    ).toBe("  We are on it  ");

    mocks.reply.mockResolvedValueOnce(
      message(13, { sender: "support", adminAddress: OPERATOR, body: "We are on it" }),
    );
    fireEvent.click(sendButton());
    const sent = await screen.findByRole("listitem", { name: "Support message 13" });

    expect(mocks.reply).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.reply.mock.calls.map((call) => call[1]);
    expect(first).toEqual({ clientId: expect.any(String), body: "We are on it" });
    expect(second.clientId).toBe(first.clientId);
    expect(mocks.reply.mock.calls[0]?.[0]).toBe(7);

    // The stored reply is shown as the operator's own, and the draft is cleared.
    expect(within(sent).getByText("We are on it")).toBeTruthy();
    expect(within(sent).getByText(/\(you\)/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Reply", { selector: "textarea" }) as HTMLTextAreaElement).value,
    ).toBe("");

    mocks.reply.mockResolvedValueOnce(message(14, { sender: "support", adminAddress: OPERATOR }));
    typeReply("Anything else?");
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.reply).toHaveBeenCalledTimes(3));
    expect(mocks.reply.mock.calls[2]?.[1].clientId).not.toBe(first.clientId);
  });

  it("gives an edited draft a new clientId after a failure", async () => {
    mount();
    await screen.findByText("My withdrawal is stuck");
    mocks.reply.mockRejectedValueOnce(new Error("Network down."));
    typeReply("Hello");
    fireEvent.click(sendButton());
    await screen.findByText(/Could not send/);

    mocks.reply.mockResolvedValueOnce(message(13, { sender: "support", adminAddress: OPERATOR }));
    typeReply("Hello again");
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.reply).toHaveBeenCalledTimes(2));
    expect(mocks.reply.mock.calls[1]?.[1].clientId).not.toBe(
      mocks.reply.mock.calls[0]?.[1].clientId,
    );
  });

  it("sends uploaded photos and refuses to send while one is still uploading", async () => {
    // jsdom has no object URLs.
    URL.createObjectURL = () => "blob:preview";
    URL.revokeObjectURL = () => {};
    let finishUpload: (value: { url: string }) => void = () => {};
    mocks.upload.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }),
    );
    mount();
    await screen.findByText("My withdrawal is stuck");

    const file = new File(["png"], "receipt.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Photo file"), { target: { files: [file] } });
    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.objectContaining({ file, purpose: "message.image", uploadId: expect.any(String) }),
      ),
    );
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Uploading…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await act(async () => finishUpload({ url: "https://storage.example/report/receipt.webp" }));
    mocks.reply.mockResolvedValueOnce(
      message(13, {
        sender: "support",
        adminAddress: OPERATOR,
        body: null,
        imageUrls: ["https://storage.example/report/receipt.webp"],
      }),
    );
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(mocks.reply).toHaveBeenCalledWith(7, {
        clientId: expect.any(String),
        imageUrls: ["https://storage.example/report/receipt.webp"],
      }),
    );
    expect(await screen.findByRole("img", { name: "Photo 1 of 1" })).toBeTruthy();
  });

  it("resolves and reopens the conversation and refreshes the queues", async () => {
    const { client } = mount();
    await screen.findByRole("heading", { name: "amina" });
    const queueKey = adminMessagingKeys.helpdeskQueue("open");
    client.setQueryData(queueKey, { pages: [], pageParams: [] });

    mocks.setHelpdeskStatus.mockResolvedValueOnce({
      ...ITEM,
      status: "resolved",
      needsReply: false,
    });
    mocks.helpdeskItem.mockResolvedValue({ ...ITEM, status: "resolved", needsReply: false });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByRole("button", { name: "Reopen" })).toBeTruthy();
    expect(mocks.setHelpdeskStatus).toHaveBeenCalledWith(7, "resolved");
    expect(screen.getByLabelText("conversation state resolved")).toBeTruthy();
    expect(client.getQueryState(queueKey)?.isInvalidated).toBe(true);

    mocks.setHelpdeskStatus.mockResolvedValueOnce(ITEM);
    mocks.helpdeskItem.mockResolvedValue(ITEM);
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByRole("button", { name: "Resolve" })).toBeTruthy();
    expect(mocks.setHelpdeskStatus).toHaveBeenLastCalledWith(7, "open");
  });

  it("keeps the status when the change fails", async () => {
    mount();
    await screen.findByRole("heading", { name: "amina" });
    mocks.setHelpdeskStatus.mockRejectedValueOnce(new Error("Conflict"));
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(mocks.setHelpdeskStatus).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Resolve" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(screen.getByLabelText("conversation state open")).toBeTruthy();
  });

  it("loads older messages before the oldest one held", async () => {
    mocks.helpdeskMessages.mockImplementation(
      (_id: number, params: { before?: number; after?: number }) =>
        Promise.resolve(
          params.before === 10
            ? { items: [message(9, { body: "Hello?" })], hasMore: false }
            : params.after === undefined
              ? { items: OPENING, hasMore: true }
              : { items: [], hasMore: false },
        ),
    );
    mount();
    await screen.findByText("My withdrawal is stuck");
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(await screen.findByText("Hello?")).toBeTruthy();
    expect(mocks.helpdeskMessages).toHaveBeenCalledWith(7, { before: 10, limit: 50 });
    expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
  });

  it("polls for messages after the newest one held", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.helpdeskMessages.mockImplementation((_id: number, params: { after?: number }) =>
      Promise.resolve(
        params.after === 12
          ? { items: [message(13, { body: "Any news?" })], hasMore: false }
          : { items: OPENING, hasMore: false },
      ),
    );
    mount();
    await screen.findByText("My withdrawal is stuck");
    await act(() => vi.advanceTimersByTimeAsync(THREAD_POLL_MS));
    expect(await screen.findByText("Any news?")).toBeTruthy();
    expect(mocks.helpdeskMessages).toHaveBeenCalledWith(
      7,
      { after: 12, limit: 100 },
      expect.any(AbortSignal),
    );
  });

  it("refuses an id that is not a positive integer without a request", async () => {
    const client = testQueryClient();
    const root = createRootRoute({ component: Outlet });
    const thread = createRoute({
      getParentRoute: () => root,
      path: "/helpdesk/$conversationId",
      component: () => (
        <HelpdeskThreadPage conversationId={useParams({ strict: false }).conversationId ?? ""} />
      ),
    });
    const router = createRouter({
      routeTree: root.addChildren([thread]),
      history: createMemoryHistory({ initialEntries: ["/helpdesk/abc"] }),
    });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Invalid conversation")).toBeTruthy();
    expect(mocks.helpdeskItem).not.toHaveBeenCalled();
  });
});
