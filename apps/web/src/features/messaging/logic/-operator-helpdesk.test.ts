import { describe, expect, it } from "vite-plus/test";
import { operatorHelpdeskMessages } from "./operator-helpdesk";

describe("operatorHelpdeskMessages", () => {
  it("shows support replies as the operator's messages and user messages as incoming", () => {
    const messages = operatorHelpdeskMessages([
      {
        id: 1,
        conversationId: 2,
        clientId: "a",
        sender: "user",
        adminAddress: null,
        body: "Help",
        imageUrls: [],
        createdAt: "2026-11-19T00:00:00Z",
      },
      {
        id: 2,
        conversationId: 2,
        clientId: "b",
        sender: "support",
        adminAddress: "0x0000000000000000000000000000000000000001",
        body: "Reply",
        imageUrls: [],
        createdAt: "2026-11-19T00:01:00Z",
      },
    ]);
    expect(messages.map((message) => message.sender)).toEqual(["peer", "self"]);
  });
});
