import { messagingKeys } from "@clc/api/features/messaging/queries";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";
import { createNotificationActivitySource } from "./activity-source";

const WALLET = "0x1111111111111111111111111111111111111111";

async function setup(initial: string) {
  const root = createRootRoute();
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/", validateSearch: (search) => search }),
    createRoute({ getParentRoute: () => root, path: "/messages/$conversationId" }),
  ]);
  const history = createMemoryHistory({ initialEntries: [initial] });
  const router = createRouter({ routeTree, history });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.status).toBe("idle"));
  const client = new QueryClient();
  return {
    router,
    history,
    client,
    ...view,
    source: createNotificationActivitySource(router, client, WALLET),
  };
}

describe("live notification Activity context", () => {
  it("follows settled section navigation and Back without stale snapshots", async () => {
    const { source, router, history, client } = await setup("/?tab=activity&section=messages");
    const listener = vi.fn();
    const stop = source.subscribe(listener);
    expect(source.current()).toEqual({ section: "messages" });
    await act(async () =>
      router.navigate({ to: "/", search: { tab: "activity", section: "helpdesk" } } as never),
    );
    expect(source.current()).toEqual({ section: "helpdesk" });
    expect(listener).toHaveBeenCalled();
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(source.current()).toEqual({ section: "messages" }));
    expect(source.current()).toEqual({ section: "messages" });
    listener.mockClear();
    client.setQueryData(["unrelated"], 1);
    expect(listener).not.toHaveBeenCalled();
    stop();
    listener.mockClear();
    await act(async () => router.navigate({ to: "/", search: { tab: "wallet" } } as never));
    expect(source.current()).toBeNull();
    client.setQueryData(["unrelated"], 1);
    expect(listener).not.toHaveBeenCalled();
    client.clear();
  });

  it("uses only the current wallet's cached thread kind, including a delayed query", async () => {
    const { source, client } = await setup("/messages/7");
    const changed = vi.fn();
    const stop = source.subscribe(changed);
    client.setQueryData(messagingKeys.conversation("other-wallet", 7), { kind: "direct" });
    expect(source.current()).toEqual({ section: null, conversationId: 7 });
    await client.fetchQuery({
      queryKey: messagingKeys.conversation(WALLET, 7),
      queryFn: async () => ({ kind: "helpdesk" }),
    });
    expect(changed).toHaveBeenCalled();
    expect(source.current()).toEqual({ section: "helpdesk", conversationId: 7 });
    stop();
    changed.mockClear();
    client.setQueryData(messagingKeys.conversation(WALLET, 7), { kind: "direct" });
    expect(changed).not.toHaveBeenCalled();
    client.clear();
  });
});
