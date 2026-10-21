import { type MouseEvent, useEffect, useRef } from "react";
import { RiArrowRightSLine, RiNotification3Fill } from "react-icons/ri";
import { toast } from "sonner";
import {
  type NotificationClientOptions,
  sendNotificationDeliveryAck,
} from "../api/notification-client";
import { type NotificationPayload, parseNotificationPayload } from "../logic/payload-schema";
import { flushQueuedNotificationAcks } from "../recovery/recovery";
import { playNotificationCue } from "./alert-cue";
import {
  enqueueNotificationAck,
  isNotificationIdentityCurrent,
  markNotificationInboxMessageRead,
  markNotificationInboxMessageShown,
  readNotificationDisplayState,
  saveNotificationInboxMessage,
  readNotificationConfig,
  readNotificationDeviceId,
} from "../storage/notification-db";

export async function showForegroundNotification(
  raw: unknown,
  identityEpoch: string,
  userId: string,
  client?: NotificationClientOptions,
): Promise<() => void> {
  const parsed = parseNotificationPayload(raw, { appOrigin: window.location.origin });
  if (!parsed.success || document.visibilityState !== "visible") return () => {};
  const payload = parsed.payload;
  if (!payload.deliveryExpiresAt || Date.parse(payload.deliveryExpiresAt) <= Date.now())
    return () => {};
  const [config, storedDeviceId] = await Promise.all([
    readNotificationConfig(),
    readNotificationDeviceId(),
  ]);
  if (
    !storedDeviceId ||
    !config?.registrationId ||
    config.userId !== userId ||
    config.identityEpoch !== identityEpoch
  )
    return () => {};
  if (
    payload.walletAddressTarget &&
    payload.walletAddressTarget.toLowerCase() !== config.identityWallet?.toLowerCase()
  )
    return () => {};
  const display = await readNotificationDisplayState(payload.notificationId);
  if (
    display.deleted ||
    display.message?.readAt ||
    display.message?.shownAt ||
    display.message?.actionedAt
  )
    return () => {};
  const deviceId = storedDeviceId;
  const registrationId = config.registrationId;
  const id = `clc:${identityEpoch}:${payload.notificationId}`;
  const receivedAt = new Date().toISOString();
  let dismissed = false;
  let shown = false;
  async function current(): Promise<boolean> {
    return (
      !dismissed &&
      !client?.signal?.aborted &&
      (await isNotificationIdentityCurrent(identityEpoch)) &&
      (await readNotificationConfig())?.registrationId === registrationId
    );
  }
  async function acknowledgeDisplay(): Promise<void> {
    if (
      shown ||
      !(await current()) ||
      document.visibilityState !== "visible" ||
      Date.parse(payload.deliveryExpiresAt ?? "") <= Date.now()
    )
      return;
    shown = true;
    // The cue follows the toast, not the push. A foreground toast does not change the badge.
    playNotificationCue();
    const shownAt = new Date().toISOString();
    await saveNotificationInboxMessage({ ...payload, receivedAt, shownAt }, identityEpoch);
    await markNotificationInboxMessageShown(payload.notificationId, shownAt, identityEpoch);
    const request = {
      deviceId,
      registrationId,
      notificationId: payload.notificationId,
      receivedAt,
      shownAt,
      walletAddressTarget: payload.walletAddressTarget,
    };
    try {
      await sendNotificationDeliveryAck(request, { ...client, identityEpoch });
    } catch (error) {
      await enqueueNotificationAck({
        identityEpoch,
        userId,
        registrationId,
        deviceId,
        kind: "delivery",
        notificationId: payload.notificationId,
        payload: request,
        error: String(error),
      });
    }
  }
  async function clicked(event: MouseEvent<HTMLAnchorElement>): Promise<void> {
    event.preventDefault();
    if (!(await current())) return;
    const timestamp = new Date().toISOString();
    await markNotificationInboxMessageRead(payload.notificationId, timestamp, identityEpoch);
    // Persist before navigation; a page unload must not lose the click receipt.
    await enqueueNotificationAck({
      identityEpoch,
      userId,
      registrationId,
      deviceId,
      kind: "click",
      notificationId: payload.notificationId,
      payload: {
        deviceId,
        registrationId,
        notificationId: payload.notificationId,
        timestamp,
        targetUrl: payload.targetUrl,
      },
    });
    void flushQueuedNotificationAcks({ client: { ...client, identityEpoch } });
    if (await current()) {
      toast.dismiss(id);
      window.location.assign(payload.targetUrl);
    }
  }
  if (!(await current())) return () => {};
  toast(
    <ForegroundNotificationContent
      payload={payload}
      onShown={() => {
        void acknowledgeDisplay().catch(() => undefined);
      }}
      onClick={(event) => {
        void clicked(event).catch(() => undefined);
      }}
    />,
    {
      id,
      // A filled info surface sets an incoming notification apart from feedback the
      // user triggered. Sonner joins class names unmerged, so the overrides are important.
      className: "border-info! bg-info! pe-3.5!",
      // Longer than feedback toasts: the user did not ask for this one and may act on it.
      duration: 6000,
      onDismiss: () => {
        dismissed = true;
      },
      onAutoClose: () => {
        dismissed = true;
      },
    },
  );
  return () => {
    dismissed = true;
    toast.dismiss(id);
  };
}

export function ForegroundNotificationContent({
  payload,
  onShown,
  onClick,
}: {
  payload: NotificationPayload;
  onShown: () => void;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const acknowledged = useRef(false);
  useEffect(() => {
    const node = ref.current?.closest<HTMLElement>("[data-sonner-toast]");
    if (!node) return;
    let frame: number | undefined;
    const observeDisplay = () => {
      if (
        acknowledged.current ||
        document.visibilityState !== "visible" ||
        node.dataset.mounted !== "true" ||
        node.dataset.visible !== "true"
      )
        return;
      frame = window.requestAnimationFrame(() => {
        if (
          !acknowledged.current &&
          document.visibilityState === "visible" &&
          node.dataset.visible === "true"
        ) {
          acknowledged.current = true;
          onShown();
        }
      });
    };
    const observer = new MutationObserver(observeDisplay);
    observer.observe(node, { attributes: true, attributeFilter: ["data-mounted", "data-visible"] });
    document.addEventListener("visibilitychange", observeDisplay);
    observeDisplay();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame ?? 0);
      document.removeEventListener("visibilitychange", observeDisplay);
    };
  }, [onShown]);
  return (
    <a
      ref={ref}
      href={payload.targetUrl}
      onClick={onClick}
      className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-start text-info-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info-foreground"
    >
      <RiNotification3Fill className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span
          dir="auto"
          className="block font-heading font-semibold leading-tight tracking-[-0.01em]"
        >
          {payload.title}
        </span>
        {/* Full opacity: a faded body fails 4.5:1 on the dark-mode info fill. */}
        <span dir="auto" className="mt-1 block font-body text-xs font-normal leading-snug">
          {payload.body}
        </span>
      </span>
      <RiArrowRightSLine
        className="size-4 shrink-0 self-center rtl:-scale-x-100"
        aria-hidden="true"
      />
    </a>
  );
}
