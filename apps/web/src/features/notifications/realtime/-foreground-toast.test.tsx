import { render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
  readConfig: vi.fn(),
  current: vi.fn(),
  delivery: vi.fn(),
  enqueue: vi.fn(),
  flush: vi.fn(),
  cue: vi.fn(),
  readDevice: vi.fn(),
  display: vi.fn(),
  markRead: vi.fn(),
  assign: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("./alert-cue", () => ({ playNotificationCue: mocks.cue }));
vi.mock("../api/notification-client", () => ({ sendNotificationDeliveryAck: mocks.delivery }));
vi.mock("../recovery/recovery", () => ({ flushQueuedNotificationAcks: mocks.flush }));
vi.mock("../storage/notification-db", () => ({
  readNotificationConfig: mocks.readConfig,
  readNotificationDeviceId: mocks.readDevice,
  isNotificationIdentityCurrent: mocks.current,
  enqueueNotificationAck: mocks.enqueue,
  markNotificationInboxMessageRead: mocks.markRead,
  markNotificationInboxMessageShown: vi.fn().mockResolvedValue(undefined),
  readNotificationDisplayState: mocks.display,
  saveNotificationInboxMessage: vi.fn().mockResolvedValue(undefined),
}));
import { ForegroundNotificationContent, showForegroundNotification } from "./foreground-toast";

const payload = {
  notificationId: "n1",
  revision: 1,
  kind: "voucher.received",
  title: "Voucher received",
  body: "New voucher",
  createdAt: "2026-10-18T10:00:00Z",
  targetUrl: "/wallet",
  priority: "high",
  deliveryExpiresAt: "2026-10-18T11:00:00Z",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-10-18T10:30:00Z"));
  mocks.readConfig.mockResolvedValue({
    identityEpoch: "epoch-1",
    identityWallet: "0xaaa",
    userId: "user-1",
    registrationId: "registration-1",
  });
  mocks.readDevice.mockResolvedValue("device-1");
  mocks.display.mockResolvedValue({ message: null, deleted: false });
  mocks.current.mockResolvedValue(true);
  mocks.delivery.mockResolvedValue({ accepted: true });
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.markRead.mockResolvedValue(undefined);
  mocks.flush.mockResolvedValue(undefined);
  vi.stubGlobal("location", { origin: "http://localhost:3000", assign: mocks.assign });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

describe("foreground notification display receipts", () => {
  it("waits until Sonner marks the mounted toast visible before acknowledging display", async () => {
    const dismiss = await showForegroundNotification(payload, "epoch-1", "user-1");
    expect(mocks.delivery).not.toHaveBeenCalled();
    const content = mocks.toast.mock.calls[0]?.[0] as ReactElement;
    const view = render(
      <div data-sonner-toast="" data-mounted="true" data-visible="false">
        {content}
      </div>,
    );
    await Promise.resolve();
    expect(mocks.delivery).not.toHaveBeenCalled();
    const container = view.container.firstElementChild as HTMLElement;
    container.dataset.visible = "true";
    await waitFor(() => expect(mocks.delivery).toHaveBeenCalledOnce());
    expect(mocks.cue).toHaveBeenCalledOnce();
    expect(mocks.cue.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.delivery.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.delivery).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: "registration-1",
        deviceId: "device-1",
        notificationId: "n1",
        shownAt: expect.any(String),
      }),
      { identityEpoch: "epoch-1" },
    );
    dismiss();
    expect(mocks.toast.dismiss).toHaveBeenCalledOnce();
  });
  it("ignores expired, hidden, or outgoing-account publications", async () => {
    await showForegroundNotification(
      { ...payload, deliveryExpiresAt: "2026-10-18T10:00:00Z" },
      "epoch-1",
      "user-1",
    );
    await showForegroundNotification(payload, "outgoing-epoch", "user-1");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await showForegroundNotification(payload, "epoch-1", "user-1");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.cue).not.toHaveBeenCalled();
  });
  it("does not acknowledge a toast whose owner changed before rendering", async () => {
    await showForegroundNotification(payload, "epoch-1", "user-1");
    mocks.current.mockResolvedValue(false);
    const content = mocks.toast.mock.calls[0]?.[0] as ReactElement;
    render(
      <div data-sonner-toast="" data-mounted="true" data-visible="true">
        {content}
      </div>,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.cue).not.toHaveBeenCalled();
  });
  it("does not acknowledge an unmounted toast", () => {
    const onShown = vi.fn();
    const { unmount } = render(
      <div data-sonner-toast="" data-mounted="true" data-visible="true">
        <ForegroundNotificationContent payload={payload} onShown={onShown} onClick={() => {}} />
      </div>,
    );
    unmount();
    expect(onShown).not.toHaveBeenCalled();
  });

  it("rejects another wallet, an incomplete registration, and an already displayed message", async () => {
    await showForegroundNotification(
      { ...payload, walletAddressTarget: "0xbbb" },
      "epoch-1",
      "user-1",
    );
    mocks.readDevice.mockResolvedValueOnce(null);
    await showForegroundNotification(payload, "epoch-1", "user-1");
    mocks.display.mockResolvedValueOnce({
      deleted: false,
      message: { ...payload, readAt: "2026-10-18T10:10:00Z" },
    });
    await showForegroundNotification(payload, "epoch-1", "user-1");

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("queues a failed display receipt and processes a click before navigation", async () => {
    mocks.delivery.mockRejectedValueOnce(new Error("offline"));
    await showForegroundNotification(payload, "epoch-1", "user-1");
    const content = mocks.toast.mock.calls[0]?.[0] as ReactElement<{
      onClick: (event: { preventDefault: () => void }) => void;
      onShown: () => void;
    }>;

    content.props.onShown();
    await waitFor(() =>
      expect(mocks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Error: offline", kind: "delivery" }),
      ),
    );

    const preventDefault = vi.fn();
    content.props.onClick({ preventDefault });
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: "click" }));
    expect(mocks.flush).toHaveBeenCalledOnce();
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("clc:epoch-1:n1");
    expect(mocks.assign).toHaveBeenCalledWith("/wallet");
  });

  it("does not display or act after Sonner dismisses or auto-closes the toast", async () => {
    await showForegroundNotification(payload, "epoch-1", "user-1");
    const [content, options] = mocks.toast.mock.calls[0] as [
      ReactElement<{
        onClick: (event: { preventDefault: () => void }) => void;
        onShown: () => void;
      }>,
      { onAutoClose: () => void; onDismiss: () => void },
    ];
    options.onDismiss();
    options.onAutoClose();
    content.props.onShown();
    content.props.onClick({ preventDefault: vi.fn() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.markRead).not.toHaveBeenCalled();
  });
});
