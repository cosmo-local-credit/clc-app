import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  disableNotificationDevice,
  fetchVapidPublicKey,
  linkNotificationWallet,
  NotificationClientError,
  registerNotificationDevice,
  sendNotificationClickAck,
  sendNotificationDeliveryAck,
  syncNotificationInbox,
  unlinkNotificationWallet,
} from "./notification-client";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notification backend URL configuration", () => {
  it("uses and trims the Web Push-specific override", async () => {
    vi.stubEnv("VITE_WEBPUSH_BASE_URL", " https://push.example/// ");
    vi.stubEnv("VITE_API_URL", "https://api.example");
    const { calls, fetcher } = createJsonFetcher({
      keyVersion: "dev-v1",
      publicKey: "test-key",
    });

    await fetchVapidPublicKey({ fetcher });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://push.example/api/notifications/vapid-public-key");
    expect(calls[0]?.init).toMatchObject({ method: "GET" });
  });

  it("falls back to VITE_API_URL", async () => {
    vi.stubEnv("VITE_WEBPUSH_BASE_URL", "");
    vi.stubEnv("VITE_API_URL", " https://api.example/// ");
    const { calls, fetcher } = createJsonFetcher({
      keyVersion: "dev-v1",
      publicKey: "test-key",
    });

    await fetchVapidPublicKey({ fetcher });

    expect(calls[0]?.input).toBe("https://api.example/api/notifications/vapid-public-key");
  });

  it("requires a configured API URL", async () => {
    vi.stubEnv("VITE_WEBPUSH_BASE_URL", "");
    vi.stubEnv("VITE_API_URL", "");
    const { calls, fetcher } = createJsonFetcher({
      keyVersion: "dev-v1",
      publicKey: "test-key",
    });

    await expect(fetchVapidPublicKey({ fetcher })).rejects.toThrow(
      "VITE_API_URL or VITE_WEBPUSH_BASE_URL must be set",
    );
    expect(calls).toHaveLength(0);
  });
});

describe("notification client options", () => {
  it("can override the backend base URL and fetch implementation per call", async () => {
    vi.stubEnv("VITE_WEBPUSH_BASE_URL", "");
    vi.stubEnv("VITE_API_URL", "");
    const { calls, fetcher } = createJsonFetcher({
      keyVersion: "dev-v1",
      publicKey: "test-key",
    });

    await expect(
      fetchVapidPublicKey({
        baseUrl: " http://backend.test/// ",
        fetcher,
      }),
    ).resolves.toEqual({ keyVersion: "dev-v1", publicKey: "test-key" });
    expect(calls[0]?.input).toBe("http://backend.test/api/notifications/vapid-public-key");
    expect(calls[0]?.init).toMatchObject({ method: "GET" });
  });

  it("rejects an explicitly empty base URL override", async () => {
    const { calls, fetcher } = createJsonFetcher({
      keyVersion: "dev-v1",
      publicKey: "test-key",
    });

    await expect(
      fetchVapidPublicKey({
        baseUrl: " ",
        fetcher,
      }),
    ).rejects.toThrow("Notification backend base URL must not be empty");
    expect(calls).toHaveLength(0);
  });
});

describe("notification API wrappers", () => {
  it("posts device registration request and parses response", async () => {
    const { calls, fetcher } = createJsonFetcher({
      canonicalLinkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
      deviceId: "device-1",
      inboxSyncCursor: "cursor-1",
      notificationSettings: { enabled: true },
      status: "registered",
      subscriptionStatus: "active",
    });

    await expect(
      registerNotificationDevice(
        {
          appVersion: "web-test",
          currentWalletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          deviceId: "device-1",
          linkedWalletAddresses: ["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
          permissionState: "granted",
          platform: "chrome-android",
          pushSubscription: {
            endpoint: "https://push.example/subscription",
            expirationTime: null,
            keys: {
              auth: "auth-secret",
              p256dh: "p256dh-key",
            },
          },
          serviceWorkerVersion: "/sw.js",
          vapidKeyVersion: "vapid-v1",
        },
        { baseUrl: "https://push.example", fetcher },
      ),
    ).resolves.toEqual({
      canonicalLinkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
      deviceId: "device-1",
      inboxSyncCursor: "cursor-1",
      notificationSettings: { enabled: true },
      status: "registered",
      subscriptionStatus: "active",
    });

    expect(calls[0]?.input).toBe("https://push.example/api/notifications/devices/register");
    expect(calls[0]?.init).toMatchObject({ method: "POST" });
    expect(header(calls[0], "Content-Type")).toBe("application/json");
    expect(await requestJson(calls[0])).toEqual({
      appVersion: "web-test",
      currentWalletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      deviceId: "device-1",
      linkedWalletAddresses: ["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
      permissionState: "granted",
      platform: "chrome-android",
      pushSubscription: {
        endpoint: "https://push.example/subscription",
        expirationTime: null,
        keys: {
          auth: "auth-secret",
          p256dh: "p256dh-key",
        },
      },
      serviceWorkerVersion: "/sw.js",
      vapidKeyVersion: "vapid-v1",
    });
  });

  it("posts wallet link and unlink requests", async () => {
    const link = createJsonFetcher({
      linkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
    });
    const unlink = createJsonFetcher({
      linkedWalletAddresses: [],
    });
    const request = {
      deviceId: "device-1",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    };

    await expect(
      linkNotificationWallet(request, {
        baseUrl: "https://push.example",
        fetcher: link.fetcher,
      }),
    ).resolves.toEqual({
      linkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
    });
    await expect(
      unlinkNotificationWallet(request, {
        baseUrl: "https://push.example",
        fetcher: unlink.fetcher,
      }),
    ).resolves.toEqual({
      linkedWalletAddresses: [],
    });

    expect(link.calls[0]?.input).toBe("https://push.example/api/notifications/devices/link-wallet");
    expect(await requestJson(link.calls[0])).toEqual(request);
    expect(unlink.calls[0]?.input).toBe(
      "https://push.example/api/notifications/devices/unlink-wallet",
    );
    expect(await requestJson(unlink.calls[0])).toEqual(request);
  });

  it("posts disable device requests", async () => {
    const { calls, fetcher } = createJsonFetcher({
      deviceId: "device-1",
      subscriptionStatus: "disabled",
    });

    await expect(
      disableNotificationDevice(
        {
          deviceId: "device-1",
          subscriptionEndpoint: "https://push.example/subscription",
        },
        { baseUrl: "https://push.example", fetcher },
      ),
    ).resolves.toEqual({
      deviceId: "device-1",
      subscriptionStatus: "disabled",
    });

    expect(calls[0]?.input).toBe("https://push.example/api/notifications/devices/disable");
    expect(await requestJson(calls[0])).toEqual({
      deviceId: "device-1",
      subscriptionEndpoint: "https://push.example/subscription",
    });
  });

  it("posts delivery acknowledgments", async () => {
    const { calls, fetcher } = createJsonFetcher({ accepted: true });

    await expect(
      sendNotificationDeliveryAck(
        {
          deviceId: "device-1",
          notificationId: "notification-1",
          platform: "chrome-android",
          receivedAt: "2026-06-05T12:00:00.000Z",
          serviceWorkerVersion: "/sw.js",
          shownAt: "2026-06-05T12:00:01.000Z",
          walletAddressTarget: "0x1234567890abcdef1234567890abcdef12345678",
        },
        { baseUrl: "https://push.example", fetcher },
      ),
    ).resolves.toEqual({ accepted: true });

    expect(calls[0]?.input).toBe("https://push.example/api/notifications/acks/delivery");
    expect(await requestJson(calls[0])).toEqual({
      deviceId: "device-1",
      notificationId: "notification-1",
      platform: "chrome-android",
      receivedAt: "2026-06-05T12:00:00.000Z",
      serviceWorkerVersion: "/sw.js",
      shownAt: "2026-06-05T12:00:01.000Z",
      walletAddressTarget: "0x1234567890abcdef1234567890abcdef12345678",
    });
  });

  it("posts click and action acknowledgments", async () => {
    const { calls, fetcher } = createJsonFetcher({ accepted: true });

    await expect(
      sendNotificationClickAck(
        {
          actionId: "view",
          deviceId: "device-1",
          notificationId: "notification-1",
          targetUrl: "/wallet",
          timestamp: "2026-06-05T12:01:00.000Z",
        },
        { baseUrl: "https://push.example", fetcher },
      ),
    ).resolves.toEqual({ accepted: true });

    expect(calls[0]?.input).toBe("https://push.example/api/notifications/acks/click");
    expect(await requestJson(calls[0])).toEqual({
      actionId: "view",
      deviceId: "device-1",
      notificationId: "notification-1",
      targetUrl: "/wallet",
      timestamp: "2026-06-05T12:01:00.000Z",
    });
  });

  it("posts inbox sync requests and defaults message priority by kind", async () => {
    const { calls, fetcher } = createJsonFetcher({
      deletedIds: ["notification-deleted"],
      messages: [
        {
          body: "Swap completed",
          createdAt: "2026-06-05T12:00:00.000Z",
          deviceId: "device-1",
          kind: "swap.completed",
          notificationId: "notification-1",
          pushStatus: "sent",
          recordId: "record-1",
          revision: 1,
          sentAt: "2026-06-05T12:00:01.000Z",
          targetUrl: "/wallet",
          title: "Swap completed",
        },
      ],
      nextSyncCursor: "cursor-2",
    });

    await expect(
      syncNotificationInbox(
        {
          deviceId: "device-1",
          lastSyncCursor: "cursor-1",
          linkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
        },
        { baseUrl: "https://push.example", fetcher },
      ),
    ).resolves.toMatchObject({
      deletedIds: ["notification-deleted"],
      messages: [
        {
          kind: "swap.completed",
          notificationId: "notification-1",
          priority: "normal",
        },
      ],
      nextSyncCursor: "cursor-2",
    });

    expect(calls[0]?.input).toBe("https://push.example/api/notifications/inbox/sync");
    expect(await requestJson(calls[0])).toEqual({
      deviceId: "device-1",
      lastSyncCursor: "cursor-1",
      linkedWalletAddresses: ["0x1234567890abcdef1234567890abcdef12345678"],
    });
  });
});

describe("notification API error handling", () => {
  it("surfaces JSON backend errors as NotificationClientError", async () => {
    const { fetcher } = createJsonFetcher({ error: "device not found" }, { status: 404 });

    try {
      await fetchVapidPublicKey({
        baseUrl: "https://push.example",
        fetcher,
      });
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NotificationClientError);
      expect(error).toMatchObject({
        body: { error: "device not found" },
        message: "device not found",
        status: 404,
      });
    }
  });

  it("surfaces non-JSON backend errors with status", async () => {
    const { fetcher } = createTextFetcher("service unavailable", {
      status: 503,
    });

    try {
      await fetchVapidPublicKey({
        baseUrl: "https://push.example",
        fetcher,
      });
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NotificationClientError);
      expect(error).toMatchObject({
        body: "service unavailable",
        message: "Request failed with 503",
        status: 503,
      });
    }
  });

  it("rejects malformed success responses", async () => {
    const { fetcher } = createJsonFetcher({
      keyVersion: "",
      publicKey: "test-key",
    });

    await expect(
      fetchVapidPublicKey({
        baseUrl: "https://push.example",
        fetcher,
      }),
    ).rejects.toThrow();
  });
});

type CapturedFetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function createJsonFetcher(
  body: unknown,
  init?: ResponseInit,
): { calls: CapturedFetchCall[]; fetcher: typeof fetch } {
  return createFetcher(() => {
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  });
}

function createTextFetcher(
  body: string,
  init?: ResponseInit,
): { calls: CapturedFetchCall[]; fetcher: typeof fetch } {
  return createFetcher(() => new Response(body, init));
}

function createFetcher(response: () => Response): {
  calls: CapturedFetchCall[];
  fetcher: typeof fetch;
} {
  const calls: CapturedFetchCall[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return response();
  };

  return { calls, fetcher };
}

async function requestJson(call: CapturedFetchCall | undefined): Promise<unknown> {
  if (!call?.init?.body || typeof call.init.body !== "string") {
    return undefined;
  }

  return JSON.parse(call.init.body) as unknown;
}

function header(call: CapturedFetchCall | undefined, name: string): string | null {
  return new Headers(call?.init?.headers).get(name);
}
