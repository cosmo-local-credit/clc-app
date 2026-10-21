import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  sync: vi.fn(),
  isCurrent: vi.fn(),
  show: vi.fn(),
  clients: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    removeAllListeners: ReturnType<typeof vi.fn>;
    listeners: Map<string, (event: { data?: unknown }) => void>;
    getToken: () => Promise<string>;
  }>,
}));
vi.mock("centrifuge", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  Centrifuge: class {
    connect = vi.fn();
    disconnect = vi.fn();
    removeAllListeners = vi.fn(() => this.listeners.clear());
    listeners = new Map<string, (event: { data?: unknown }) => void>();
    getToken: () => Promise<string>;
    constructor(_url: string, options: { getToken: () => Promise<string> }) {
      this.getToken = options.getToken;
      mocks.clients.push(this);
    }
    on(name: string, callback: (event: { data?: unknown }) => void) {
      this.listeners.set(name, callback);
      return this;
    }
  },
}));
vi.mock("@clc/api/features/notifications/client", () => ({
  fetchNotificationRealtimeToken: mocks.token,
  NotificationTransportError: class extends Error {
    status = 401;
  },
}));
vi.mock("../storage/notification-db", () => ({ isNotificationIdentityCurrent: mocks.isCurrent }));
vi.mock("../recovery/recovery", () => ({ syncNotificationInboxState: mocks.sync }));
vi.mock("./foreground-toast", () => ({ showForegroundNotification: mocks.show }));
import { NotificationTransportError } from "@clc/api/features/notifications/client";
import { connectNotificationRealtime } from "./connection";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clients.length = 0;
  mocks.isCurrent.mockResolvedValue(true);
  mocks.token.mockResolvedValue({
    token: "token-1",
    userId: "user-1",
    walletAddress: "0xaaa",
    websocketUrl: "wss://realtime.example/connection/websocket",
    expiresAt: "2026-10-18T13:00:00Z",
  });
  mocks.sync.mockResolvedValue({ status: "synced" });
  mocks.show.mockResolvedValue(vi.fn());
});

const identity = {
  identityEpoch: "epoch-1",
  userId: "user-1",
  walletAddress: "0xaaa",
  baseUrl: "https://api.example",
};

describe("notification realtime ownership", () => {
  it("uses the official client and syncs after connect and newer publications", async () => {
    const stop = await connectNotificationRealtime(identity);
    const client = mocks.clients[0];
    expect(client?.connect).toHaveBeenCalledOnce();
    client?.listeners.get("connected")?.({});
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(1));
    client?.listeners.get("publication")?.({ data: { notificationId: "n1", revision: 2 } });
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2));
    client?.listeners.get("publication")?.({ data: { notificationId: "n1", revision: 1 } });
    await Promise.resolve();
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    stop();
    expect(client?.disconnect).toHaveBeenCalledOnce();
  });
  it("rejects a token refresh belonging to another account", async () => {
    const changed = vi.fn();
    const stop = await connectNotificationRealtime({ ...identity, onIdentityChanged: changed });
    mocks.token.mockResolvedValue({ token: "other", userId: "user-2" });
    await expect(mocks.clients[0]?.getToken()).rejects.toThrow();
    expect(changed).toHaveBeenCalledOnce();
    stop();
  });
  it("does not connect after ownership changed while obtaining the token", async () => {
    mocks.isCurrent.mockResolvedValue(false);
    await connectNotificationRealtime(identity);
    expect(mocks.clients).toHaveLength(0);
  });

  it("rejects aborted and mismatched initial tokens without constructing a client", async () => {
    const controller = new AbortController();
    controller.abort();
    await connectNotificationRealtime({ ...identity, signal: controller.signal });
    await connectNotificationRealtime({
      ...identity,
      initialToken: {
        expiresAt: "2026-10-18T13:00:00Z",
        token: "other-user",
        userId: "user-2",
        walletAddress: "0xaaa",
        websocketUrl: "wss://realtime.example/connection/websocket",
      },
    });
    await connectNotificationRealtime({
      ...identity,
      initialToken: {
        expiresAt: "2026-10-18T13:00:00Z",
        token: "other-wallet",
        userId: "user-1",
        walletAddress: "0xbbb",
        websocketUrl: "wss://realtime.example/connection/websocket",
      },
    });

    expect(mocks.clients).toHaveLength(0);
  });

  it("classifies unauthorized refreshes and preserves retryable transport failures", async () => {
    const changed = vi.fn();
    const stop = await connectNotificationRealtime({ ...identity, onIdentityChanged: changed });
    const client = mocks.clients[0];

    mocks.token.mockRejectedValueOnce(new NotificationTransportError(401));
    await expect(client?.getToken()).rejects.toThrow("Notification session changed.");
    expect(changed).toHaveBeenCalledOnce();

    mocks.token.mockRejectedValueOnce(new Error("offline"));
    await expect(client?.getToken()).rejects.toThrow("offline");
    expect(changed).toHaveBeenCalledOnce();

    stop();
    await expect(client?.getToken()).rejects.toThrow("Notification session changed.");
  });

  it("stops when the identity changes during durable sync and cleans up once", async () => {
    const controller = new AbortController();
    const stop = await connectNotificationRealtime({ ...identity, signal: controller.signal });
    const client = mocks.clients[0];
    const connected = client?.listeners.get("connected");
    mocks.isCurrent.mockResolvedValueOnce(false);

    connected?.({});
    await vi.waitFor(() => expect(client?.disconnect).toHaveBeenCalledOnce());
    stop();
    controller.abort();

    expect(client?.disconnect).toHaveBeenCalledOnce();
    expect(client?.removeAllListeners).toHaveBeenCalledOnce();
  });

  it("recovers on online and visible events without reporting unchanged or failed syncs", async () => {
    const changed = vi.fn();
    mocks.sync
      .mockResolvedValueOnce({ status: "unchanged" })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: "synced" });
    const stop = await connectNotificationRealtime({ ...identity, onInboxChanged: changed });

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2));
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(3));

    expect(changed).toHaveBeenCalledOnce();
    stop();
  });

  it("bounds publication revisions and active toast dismissers", async () => {
    const dismissers = Array.from({ length: 513 }, () => vi.fn());
    let nextDismisser = 0;
    mocks.show.mockImplementation(async () => dismissers[nextDismisser++] ?? vi.fn());
    const stop = await connectNotificationRealtime(identity);
    const publication = mocks.clients[0]?.listeners.get("publication");

    for (let index = 0; index < 513; index += 1)
      publication?.({ data: { notificationId: `n-${index}`, revision: 1 } });
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledTimes(513));
    await Promise.resolve();

    expect(dismissers[0]).toHaveBeenCalledOnce();
    expect(dismissers[492]).toHaveBeenCalledOnce();
    expect(dismissers[512]).not.toHaveBeenCalled();
    stop();
    expect(dismissers[512]).toHaveBeenCalledOnce();
  });
});
