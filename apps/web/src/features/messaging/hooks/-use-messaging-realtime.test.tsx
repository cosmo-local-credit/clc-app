import { messagingKeys } from "@clc/api/features/messaging/queries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const VIEWER = "0x2a986F40d29fc7e1Bded626542d4b8f1Ca0A82f6";

vi.mock("#/lib/messaging-config", () => ({ MESSAGING_ENABLED: true }));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ isAuthenticated: true, address: VIEWER }),
}));

import {
  dispatchMessagingChanged,
  NOTIFICATION_INBOX_CHANGED_EVENT,
} from "#/features/notifications/realtime/events";
import { useMessagingRealtime } from "./use-messaging-realtime";

function setup() {
  const client = new QueryClient();
  const keys = {
    unread: messagingKeys.unread(VIEWER),
    list: messagingKeys.list(VIEWER, "direct"),
    thread5: messagingKeys.messages(VIEWER, 5),
    thread6: messagingKeys.conversation(VIEWER, 6),
    other: messagingKeys.unread("0x0000000000000000000000000000000000000001"),
  };
  for (const key of Object.values(keys)) client.setQueryData(key, {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useMessagingRealtime(), { wrapper });
  const stale = () =>
    Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        client.getQueryState(key)?.isInvalidated ?? false,
      ]),
    );
  return { stale };
}

describe("messaging realtime invalidation", () => {
  it("refreshes counts, lists and only the named thread on a messaging sync", () => {
    const { stale } = setup();
    act(() => dispatchMessagingChanged(5));
    expect(stale()).toEqual({
      unread: true,
      list: true,
      thread5: true,
      thread6: false,
      other: false,
    });
  });

  it("refreshes no thread for a sync that names no conversation", () => {
    const { stale } = setup();
    act(() => dispatchMessagingChanged(0));
    expect(stale()).toMatchObject({ unread: true, list: true, thread5: false, thread6: false });
  });

  it("refreshes counts, lists and every thread on an inbox change", () => {
    const { stale } = setup();
    act(() => {
      window.dispatchEvent(new Event(NOTIFICATION_INBOX_CHANGED_EVENT));
    });
    expect(stale()).toEqual({
      unread: true,
      list: true,
      thread5: true,
      thread6: true,
      other: false,
    });
  });
});
