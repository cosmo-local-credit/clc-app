/// <reference lib="webworker" />

import { refreshNotificationPushSubscription } from "@clc/api/features/notifications/client";
import {
  fetchVapidPublicKey,
  getNotificationBackendBaseUrl,
  sendNotificationClickAck,
  sendNotificationDeliveryAck,
} from "../api/notification-client";
import { flushQueuedNotificationAcks } from "../recovery/recovery";
import { syncNavigatorAppBadge } from "../realtime/app-badge";
import {
  consumePendingNotificationClickEvents,
  enqueueNotificationAck,
  getOrCreateNotificationDeviceId,
  getOrCreateNotificationInstallation,
  incrementUnseenCount,
  isNotificationIdentityCurrent,
  markNotificationInboxMessageActioned,
  markNotificationInboxMessageRead,
  markNotificationInboxMessageShown,
  readNotificationDisplayState,
  readNotificationConfig,
  readNotificationDeviceId,
  recordSubscriptionDiagnostic,
  saveNotificationInboxMessage,
  savePendingNotificationClickEvent,
  updateNotificationConfig,
} from "../storage/notification-db";
import {
  serializePushSubscription,
  subscribeWithVapidPublicKey,
} from "../subscription/subscription-state";
import {
  handleNotificationClick,
  handleNotificationPush,
  type NotificationServiceWorkerDependencies,
} from "./handlers";
import {
  NOTIFICATION_SERVICE_WORKER_VERSION,
  NOTIFICATION_WORKER_PROTOCOL_VERSION,
  type NotificationWorkerMessage,
} from "./protocol";
import {
  handleNotificationProtocolMessage,
  type NotificationProtocolHandlerDependencies,
} from "./protocol-handler";
import {
  handlePushSubscriptionChange,
  type NotificationSubscriptionChangeDependencies,
} from "./subscription-change";

export function registerNotificationServiceWorkerHandlers(scope: ServiceWorkerGlobalScope): void {
  const dependencies = createDependencies(scope);

  scope.addEventListener("push", (event) => {
    event.waitUntil(handleNotificationPush(readPushData(event), dependencies));
  });

  scope.addEventListener("notificationclick", (event) => {
    event.waitUntil(
      handleNotificationClick(
        {
          action: event.action,
          close: () => event.notification.close(),
          data: event.notification.data,
        },
        dependencies,
      ),
    );
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      Promise.allSettled([
        flushQueuedNotificationAcks(),
        updateNotificationConfig({
          serviceWorkerVersion: NOTIFICATION_SERVICE_WORKER_VERSION,
          workerProtocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
        }),
      ]),
    );
  });

  scope.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(processPushSubscriptionChange(scope, event));
  });

  scope.addEventListener("message", (event) => {
    event.waitUntil(
      handleNotificationProtocolMessage(
        event.data,
        (message) => respondToMessageEvent(event, message),
        createProtocolDependencies(),
      ),
    );
  });
}

function createDependencies(
  scope: ServiceWorkerGlobalScope,
): NotificationServiceWorkerDependencies {
  return {
    appOrigin: scope.location.origin,
    broadcast: (message) => broadcastToWindowClients(scope, message),
    enqueueAck: enqueueNotificationAck,
    flushQueuedAcks: flushQueuedNotificationAcks,
    focusOrOpen: (targetUrl, beforeOpen, identityEpoch) =>
      focusOrOpenWindow(scope, targetUrl, beforeOpen, identityEpoch),
    getDeviceId: getOrCreateNotificationDeviceId,
    readConfig: readNotificationConfig,
    readDisplayState: readNotificationDisplayState,
    markInboxMessageShown: markNotificationInboxMessageShown,
    dismissNotification: async (notificationId, registrationId) => {
      const notifications = await scope.registration.getNotifications();
      for (const notification of notifications) {
        const data = notification.data as
          | { notificationId?: string; registrationId?: string }
          | undefined;
        if (data?.notificationId === notificationId && data.registrationId === registrationId)
          notification.close();
      }
    },
    isIdentityCurrent: isNotificationIdentityCurrent,
    markInboxMessageActioned: markNotificationInboxMessageActioned,
    markInboxMessageRead: markNotificationInboxMessageRead,
    now: () => new Date().toISOString(),
    saveInboxMessage: saveNotificationInboxMessage,
    savePendingClickEvent: savePendingNotificationClickEvent,
    sendClickAck: sendNotificationClickAck,
    sendDeliveryAck: sendNotificationDeliveryAck,
    showNotification: (title, options) => scope.registration.showNotification(title, options),
    matchWindowClients: async () => {
      const clients = (await scope.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      })) as WindowClient[];
      return clients.map((client) => ({ visibilityState: client.visibilityState }));
    },
    incrementUnseenCount,
    syncAppBadge: syncNavigatorAppBadge,
  };
}

function createProtocolDependencies(): NotificationProtocolHandlerDependencies {
  return {
    consumeDelayedClicks: consumePendingNotificationClickEvents,
    flushQueuedAcks: flushQueuedNotificationAcks,
    updateRegistrationState: (serviceWorkerVersion) =>
      updateNotificationConfig({
        serviceWorkerVersion,
        workerProtocolVersion: NOTIFICATION_WORKER_PROTOCOL_VERSION,
      }),
  };
}

function respondToMessageEvent(
  event: ExtendableMessageEvent,
  message: NotificationWorkerMessage,
): void {
  const responsePort = event.ports[0];
  if (responsePort) {
    responsePort.postMessage(message);
    return;
  }

  event.source?.postMessage(message);
}

async function processPushSubscriptionChange(
  scope: ServiceWorkerGlobalScope,
  event: PushSubscriptionChangeEvent,
): Promise<void> {
  try {
    const newSubscription = event.newSubscription
      ? serializePushSubscription(event.newSubscription)
      : null;
    await handlePushSubscriptionChange(
      newSubscription,
      createSubscriptionChangeDependencies(scope),
    );
  } catch (error) {
    await recordSubscriptionDiagnostic({
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    }).catch(() => undefined);
  }
}

function createSubscriptionChangeDependencies(
  scope: ServiceWorkerGlobalScope,
): NotificationSubscriptionChangeDependencies {
  return {
    fetchVapid: fetchVapidPublicKey,
    getCurrentSubscription: async () => {
      const subscription = await scope.registration.pushManager.getSubscription();
      return subscription ? serializePushSubscription(subscription) : null;
    },
    getDeviceId: readNotificationDeviceId,
    readConfig: readNotificationConfig,
    recordFailure: (error) =>
      recordSubscriptionDiagnostic({
        error,
        status: "failed",
      }),
    recordRefresh: (subscription, vapidKeyVersion) =>
      recordSubscriptionDiagnostic({
        endpoint: subscription.endpoint,
        status: "refreshed",
        vapidKeyVersion,
      }),
    registerDevice: async (request, identityEpoch) => {
      const config = await readNotificationConfig();
      if (
        !config?.registrationId ||
        !config.identityEpoch ||
        config.identityEpoch !== identityEpoch ||
        config.registrationId !== request.registrationId
      )
        throw new Error("Notification registration is missing.");
      const installation = await getOrCreateNotificationInstallation();
      if (!(await isNotificationIdentityCurrent(config.identityEpoch))) return;
      if (!request.pushSubscription) return;
      await refreshNotificationPushSubscription(
        {
          deviceId: request.deviceId,
          registrationId: config.registrationId,
          pushSubscription: request.pushSubscription,
          vapidKeyVersion: request.vapidKeyVersion,
        },
        { baseUrl: getNotificationBackendBaseUrl(), deviceToken: installation.installationToken },
      );
    },
    resubscribe: (publicKey) => subscribeWithVapidPublicKey(scope.registration, publicKey),
    updateConfig: updateNotificationConfig,
  };
}

function readPushData(event: PushEvent): unknown {
  if (!event.data) {
    return null;
  }

  try {
    return event.data.json() as unknown;
  } catch {
    return event.data.text();
  }
}

async function broadcastToWindowClients(
  scope: ServiceWorkerGlobalScope,
  message: NotificationWorkerMessage,
): Promise<void> {
  const windowClients = await scope.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });

  for (const client of windowClients) {
    client.postMessage(message);
  }
}

async function focusOrOpenWindow(
  scope: ServiceWorkerGlobalScope,
  targetUrl: string,
  beforeOpen: () => Promise<unknown>,
  identityEpoch?: string,
): Promise<void> {
  const absoluteTargetUrl = new URL(targetUrl, scope.location.origin).href;
  const windowClients = (await scope.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  })) as WindowClient[];
  const appClient = windowClients.find(
    (client) => new URL(client.url).origin === scope.location.origin,
  );

  if (!(await isNotificationIdentityCurrent(identityEpoch))) return;
  if (appClient) {
    try {
      await appClient.navigate(absoluteTargetUrl);
    } finally {
      await appClient.focus();
    }
    return;
  }

  await beforeOpen().catch(() => undefined);
  if (await isNotificationIdentityCurrent(identityEpoch))
    await scope.clients.openWindow(absoluteTargetUrl);
}
