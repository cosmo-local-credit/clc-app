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
