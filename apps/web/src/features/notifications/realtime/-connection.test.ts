import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  sync: vi.fn(),
  isCurrent: vi.fn(),
  clients: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    listeners: Map<string, (event: { data?: unknown }) => void>;
    getToken: () => Promise<string>;
  }>,
}));
vi.mock("centrifuge", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  Centrifuge: class {
    connect = vi.fn();
    disconnect = vi.fn();
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
    removeAllListeners() {
      this.listeners.clear();
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
});
