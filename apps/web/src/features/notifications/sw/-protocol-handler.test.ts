import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  handleNotificationProtocolMessage,
  type NotificationProtocolHandlerDependencies,
} from "./protocol-handler";
import type { NotificationWorkerMessage } from "./protocol";

describe("handleNotificationProtocolMessage", () => {
  let dependencies: NotificationProtocolHandlerDependencies;
  let respond: ReturnType<typeof createRespond>;

  beforeEach(() => {
    dependencies = {
      consumeDelayedClicks: vi.fn().mockResolvedValue([]),
      flushQueuedAcks: vi.fn().mockResolvedValue(undefined),
      updateRegistrationState: vi.fn().mockResolvedValue(undefined),
    };
    respond = createRespond();
  });

  it("reports compatibility when supported ranges overlap", async () => {
    await expect(
      handleNotificationProtocolMessage(
        {
          requestId: "request-1",
          supportedProtocolVersions: [1, 2],
          type: "notification:check-compatibility",
        },
        respond,
        dependencies,
      ),
    ).resolves.toBe("handled");

    expect(respond).toHaveBeenCalledWith({
      compatible: true,
      protocolVersion: 1,
      requestId: "request-1",
      type: "notification:compatibility-result",
    });
  });

  it("reports incompatible page versions without interpreting versioned messages", async () => {
    await handleNotificationProtocolMessage(
      {
        requestId: "request-1",
        supportedProtocolVersions: [2],
        type: "notification:check-compatibility",
      },
      respond,
      dependencies,
    );

    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        compatible: false,
        protocolVersion: 1,
      }),
    );
    await expect(
      handleNotificationProtocolMessage(
        {
          protocolVersion: 2,
          requestId: "request-2",
          type: "notification:flush-ack-queue",
        },
        respond,
        dependencies,
      ),
    ).resolves.toBe("ignored");
    expect(dependencies.flushQueuedAcks).not.toHaveBeenCalled();
  });

  it("flushes acknowledgments and returns a correlated response", async () => {
    await handleNotificationProtocolMessage(
      {
        protocolVersion: 1,
        requestId: "request-1",
        type: "notification:flush-ack-queue",
      },
      respond,
      dependencies,
    );

    expect(dependencies.flushQueuedAcks).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledWith({
      protocolVersion: 1,
      requestId: "request-1",
      type: "notification:ack-queue-flushed",
    });
  });

  it("persists registration state and consumes delayed clicks", async () => {
    await handleNotificationProtocolMessage(
      {
        protocolVersion: 1,
        requestId: "request-state",
        serviceWorkerVersion: "notifications-worker-v1",
        type: "notification:registration-state-updated",
      },
      respond,
      dependencies,
    );
    expect(dependencies.updateRegistrationState).toHaveBeenCalledWith("notifications-worker-v1");

    vi.mocked(dependencies.consumeDelayedClicks).mockResolvedValue([
      {
        createdAt: "2026-06-11T12:00:00.000Z",
        eventId: "event-1",
        notificationId: "notification-1",
        targetUrl: "/wallet",
      },
    ]);
    await handleNotificationProtocolMessage(
      {
        protocolVersion: 1,
        requestId: "request-clicks",
        type: "notification:consume-delayed-clicks",
      },
      respond,
      dependencies,
    );

    expect(respond).toHaveBeenLastCalledWith({
      events: [
        {
          createdAt: "2026-06-11T12:00:00.000Z",
          eventId: "event-1",
          notificationId: "notification-1",
          targetUrl: "/wallet",
        },
      ],
      protocolVersion: 1,
      requestId: "request-clicks",
      type: "notification:delayed-clicks",
    });
  });

  it("ignores malformed messages", async () => {
    await expect(
      handleNotificationProtocolMessage(
        {
          requestId: "",
          type: "notification:check-compatibility",
        },
        respond,
        dependencies,
      ),
    ).resolves.toBe("ignored");
    expect(respond).not.toHaveBeenCalled();
  });
});

function createRespond() {
  return vi.fn<(message: NotificationWorkerMessage) => void>();
}
