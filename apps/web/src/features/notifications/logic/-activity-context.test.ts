import { describe, expect, it } from "vite-plus/test";
import { notificationActivityContext, isNotificationActivityVisible } from "./activity-context";
import { NOTIFICATION_KINDS, type NotificationPayload } from "./payload-schema";

const payload: NotificationPayload = {
  notificationId: "n1",
  kind: "message.received",
  title: "Message",
  body: "Hello",
  targetUrl: "/messages/7",
  conversationId: "7",
  createdAt: "2026-11-23T10:00:00Z",
  priority: "high",
};

describe("Activity alert destinations", () => {
  it.each(NOTIFICATION_KINDS)("matches %s to its existing Activity section", (kind) => {
    const section =
      kind === "helpdesk.reply"
        ? "helpdesk"
        : kind.startsWith("message.")
          ? "messages"
          : kind === "voucher.received"
            ? "transactions"
            : kind === "offramp.completed"
              ? null
              : "notifications";
    for (const current of ["transactions", "messages", "notifications", "helpdesk"] as const)
      expect(isNotificationActivityVisible({ ...payload, kind }, { section: current })).toBe(
        current === section,
      );
    expect(isNotificationActivityVisible({ ...payload, kind }, null)).toBe(false);
  });

  it("uses the existing Transactions default regardless of filters or an open inspector", () => {
    for (const section of [undefined, "invalid", "transactions"])
      expect(
        notificationActivityContext({
          pathname: "/",
          search: { tab: "activity", section, tx: "selected", view: "map" },
        }),
      ).toEqual({ section: "transactions" });
    expect(
      notificationActivityContext({
        pathname: "/",
        search: { tab: "activity", section: "messages" },
      }),
    ).toEqual({ section: "messages" });
  });

  it("does not treat section parameters on other pages as Activity", () => {
    for (const pathname of ["/", "/pools/0xabc", "/vouchers/0xabc", "/settings/profile", "/market"])
      expect(
        notificationActivityContext({ pathname, search: { tab: "wallet", section: "messages" } }),
      ).toBeNull();
    expect(
      notificationActivityContext({
        pathname: "/market",
        search: { tab: "activity", section: "messages" },
      }),
    ).toBeNull();
  });

  it("keeps the whole Messages section quiet inside any direct conversation", () => {
    const context = notificationActivityContext({ pathname: "/messages/99", search: {} }, "direct");
    expect(context).toEqual({ section: "messages", conversationId: 99 });
    expect(isNotificationActivityVisible(payload, context)).toBe(true);
    expect(isNotificationActivityVisible({ ...payload, kind: "helpdesk.reply" }, context)).toBe(
      false,
    );
  });

  it("classifies Helpdesk threads separately and matches only the open thread while kind is loading", () => {
    const location = { pathname: "/messages/7/", search: {} };
    expect(notificationActivityContext(location, "helpdesk")).toEqual({
      section: "helpdesk",
      conversationId: 7,
    });
    const pending = notificationActivityContext(location);
    expect(isNotificationActivityVisible(payload, pending)).toBe(true);
    expect(isNotificationActivityVisible({ ...payload, conversationId: undefined }, pending)).toBe(
      true,
    );
    expect(isNotificationActivityVisible({ ...payload, conversationId: "8" }, pending)).toBe(false);
    expect(isNotificationActivityVisible({ ...payload, kind: "voucher.received" }, pending)).toBe(
      false,
    );
  });
});
