import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchNotificationRealtimeToken,
  NotificationTransportError,
  refreshNotificationPushSubscription,
} from "./client";

describe("notification transport", () => {
  it("authenticates token issuance with the existing cookie session", async () => {
    const token = {
      token: "jwt",
      userId: "42",
      walletAddress: "0xaaa",
      websocketUrl: "wss://realtime.example/connection/websocket",
      expiresAt: "2026-10-18T11:00:00Z",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(token));
    expect(
      await fetchNotificationRealtimeToken({ baseUrl: "https://api.example/", fetcher }),
    ).toEqual(token);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example/api/notifications/realtime/token",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
  it("refreshes a captured push registration using installation proof", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ subscriptionStatus: "active" }));
    const request = {
      deviceId: "device-1",
      registrationId: "registration-1",
      pushSubscription: {
        endpoint: "https://push.example/1",
        keys: { auth: "auth", p256dh: "key" },
      },
    };
    await refreshNotificationPushSubscription(request, {
      baseUrl: "https://api.example",
      deviceToken: "a".repeat(64),
      fetcher,
    });
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-Notification-Device-Token")).toBe("a".repeat(64));
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "null")).toEqual(request);
  });
  it("keeps authorization failures distinguishable for SDK token refresh", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 }));
    await expect(
      fetchNotificationRealtimeToken({ baseUrl: "https://api.example", fetcher }),
    ).rejects.toEqual(new NotificationTransportError(401));
  });
});
