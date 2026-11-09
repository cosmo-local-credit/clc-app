import { describe, expect, it, vi } from "vite-plus/test";
import {
  dispatchMessagingChanged,
  MESSAGING_CHANGED_EVENT,
  messagingChangedConversationId,
} from "./events";

describe("messaging changed event", () => {
  it("carries the conversation id, with 0 read as none", () => {
    const seen: Array<number | null> = [];
    const listener = vi.fn((event: Event) => seen.push(messagingChangedConversationId(event)));
    window.addEventListener(MESSAGING_CHANGED_EVENT, listener);
    dispatchMessagingChanged(7);
    dispatchMessagingChanged(0);
    window.removeEventListener(MESSAGING_CHANGED_EVENT, listener);
    expect(seen).toEqual([7, null]);
  });
});
