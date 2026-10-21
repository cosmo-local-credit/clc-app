import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  begin: vi.fn(),
  current: vi.fn(),
  readConfig: vi.fn(),
  register: vi.fn(),
  update: vi.fn(),
  recover: vi.fn(),
  connect: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@clc/api/features/notifications/client", () => ({
  fetchNotificationRealtimeToken: mocks.token,
  NotificationTransportError: class NotificationTransportError extends Error {
    status: number;

    constructor(status: number) {
      super(`Notification transport failed with ${status}`);
      this.status = status;
    }
  },
}));
vi.mock("../api/notification-client", () => ({
  getNotificationBackendBaseUrl: () => "https://api.example",
  registerNotificationDevice: mocks.register,
}));
vi.mock("../recovery/identity-reset", () => ({ whenNotificationIdentitySettled: async () => {} }));
vi.mock("../recovery/recovery", () => ({ runNotificationRecovery: mocks.recover }));
vi.mock("../storage/notification-db", () => ({
  NOTIFICATION_IDENTITY_EVENT: "clc-notification-identity",
  beginNotificationIdentity: mocks.begin,
  getOrCreateNotificationDeviceId: async () => "device-1",
  isNotificationIdentityCurrent: mocks.current,
  readNotificationConfig: mocks.readConfig,
  updateNotificationConfig: mocks.update,
}));
vi.mock("./connection", () => ({ connectNotificationRealtime: mocks.connect }));
import { NotificationTransportError } from "@clc/api/features/notifications/client";
import { startNotificationSession } from "./session";

const identity = {
  identityEpoch: "epoch-1",
  registrationId: "registration-1",
  userId: "user-1",
  identityWallet: "0xaaa",
};
const token = {
  token: "jwt",
  userId: "user-1",
  walletAddress: "0xaaa",
  websocketUrl: "wss://realtime.example/connection/websocket",
  expiresAt: "2026-10-18T13:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue(token);
  mocks.begin.mockResolvedValue(identity);
  mocks.current.mockResolvedValue(true);
  mocks.readConfig.mockResolvedValue(identity);
  mocks.register.mockResolvedValue({
    registrationId: "registration-2",
    userId: "user-1",
    generation: 2,
    inboxSyncCursor: "registered-cursor",
  });
  mocks.recover.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue(mocks.stop);
});
function options(controller = new AbortController()) {
  return {
    walletAddress: "0xaaa",
    signal: controller.signal,
    onInboxChanged: vi.fn(),
    onIdentityChanged: vi.fn(),
  };
}

describe("notification session lifecycle", () => {
  it("rechecks auth when the realtime token request is unauthorized", async () => {
    mocks.token.mockRejectedValue(new NotificationTransportError(401));
    const request = options();

    await expect(startNotificationSession(request)).rejects.toThrow(
      "Notification transport failed with 401",
    );

    expect(request.onIdentityChanged).toHaveBeenCalledOnce();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("does not change another tab's inbox when the cookie belongs to another wallet", async () => {
    mocks.token.mockResolvedValue({ ...token, walletAddress: "0xbbb", userId: "user-2" });
    const request = options();
    await startNotificationSession(request);
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(request.onIdentityChanged).toHaveBeenCalledOnce();
  });
  it("cleans up an aborted StrictMode mount while the token request is pending", async () => {
    let resolve: (value: typeof token) => void = () => {};
    mocks.token.mockImplementationOnce(
      () =>
        new Promise<typeof token>((done) => {
          resolve = done;
        }),
    );
    const controller = new AbortController();
    const pending = startNotificationSession(options(controller));
    await vi.waitFor(() => expect(mocks.token).toHaveBeenCalledOnce());
    controller.abort();
    resolve(token);
    await pending;
    expect(mocks.begin).not.toHaveBeenCalled();
    const stop = await startNotificationSession(options());
    expect(mocks.connect).toHaveBeenCalledOnce();
    stop();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("connects realtime even when push health recovery has not completed", async () => {
    mocks.recover.mockReturnValue(new Promise<void>(() => {}));
    const stop = await startNotificationSession(options());
    expect(mocks.connect).toHaveBeenCalledOnce();
    stop();
  });

  it("registers a missing device before recovery and keeps the existing sync cursor", async () => {
    mocks.begin.mockResolvedValue({
      ...identity,
      registrationId: null,
      syncCursor: "saved-cursor",
    });
    const request = options();

    const stop = await startNotificationSession(request);

    expect(mocks.register).toHaveBeenCalledWith(
      { deviceId: "device-1", currentWalletAddress: "0xaaa" },
      expect.objectContaining({ identityEpoch: "epoch-1", signal: request.signal }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      {
        registrationId: "registration-2",
        userId: "user-1",
        generation: 2,
        syncCursor: "saved-cursor",
      },
      "epoch-1",
    );
    expect(mocks.connect).toHaveBeenCalledOnce();
    stop();
  });

  it("uses the registration cursor for a newly registered identity", async () => {
    mocks.begin.mockResolvedValue({
      ...identity,
      registrationId: null,
      userId: "previous-user",
      syncCursor: null,
    });

    const stop = await startNotificationSession(options());

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ syncCursor: "registered-cursor" }),
      "epoch-1",
    );
    stop();
  });

  it("does not connect when registration resolves for another user", async () => {
    mocks.begin.mockResolvedValue({ ...identity, registrationId: null });
    mocks.register.mockResolvedValue({
      registrationId: "registration-other",
      userId: "user-2",
      generation: 2,
      inboxSyncCursor: null,
    });

    await startNotificationSession(options());

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("stops before registration or connection when the identity epoch is stale", async () => {
    mocks.current.mockResolvedValue(false);

    await startNotificationSession(options());

    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("swallows recovery failures and still establishes realtime", async () => {
    mocks.recover.mockRejectedValue(new Error("push unavailable"));

    const stop = await startNotificationSession(options());

    expect(mocks.connect).toHaveBeenCalledOnce();
    await Promise.resolve();
    stop();
  });

  it("does not connect if the identity changes while recovery starts", async () => {
    mocks.current.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await startNotificationSession(options());

    expect(mocks.recover).toHaveBeenCalledOnce();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("disconnects and rechecks auth when another tab changes the registration epoch", async () => {
    const request = options();
    const stop = await startNotificationSession(request);
    mocks.readConfig.mockResolvedValue({ ...identity, identityEpoch: "epoch-2" });
    window.dispatchEvent(new StorageEvent("storage", { key: "clc-notification-identity" }));
    await vi.waitFor(() => expect(request.onIdentityChanged).toHaveBeenCalledOnce());
    expect(mocks.stop).toHaveBeenCalledOnce();
    stop();
  });
});
