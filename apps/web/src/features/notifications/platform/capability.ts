type NotificationCapabilityStatus = "install-required" | "supported" | "unsupported";

export type NotificationCapabilityPlatform =
  | "chrome-android"
  | "ios-safari-home-screen"
  | "ios-safari-tab"
  | "unsupported";

type NotificationCapabilityReason =
  | "insecure-context"
  | "ios-safari-tab"
  | "missing-notification-api"
  | "missing-push-manager"
  | "missing-service-worker"
  | "unsupported-platform";

export type NotificationPermissionSnapshot = NotificationPermission | "unavailable";

export type NotificationCapabilityEnvironment = {
  hasNotification?: boolean;
  hasPushManager?: boolean;
  hasServiceWorker?: boolean;
  isSecureContext?: boolean;
  isStandalone?: boolean;
  maxTouchPoints?: number;
  notificationPermission?: NotificationPermission;
  userAgent?: string;
};

export type NotificationCapability = {
  canRequestPermission: boolean;
  canSubscribe: boolean;
  hasNotification: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  isSecureContext: boolean;
  permission: NotificationPermissionSnapshot;
  platform: NotificationCapabilityPlatform;
  reasons: NotificationCapabilityReason[];
  status: NotificationCapabilityStatus;
};

type PlatformInput = {
  isStandalone: boolean;
  maxTouchPoints: number;
  userAgent: string;
};

export function detectNotificationCapability(
  environment: NotificationCapabilityEnvironment = readNotificationCapabilityEnvironment(),
): NotificationCapability {
  const hasNotification = environment.hasNotification ?? false;
  const hasPushManager = environment.hasPushManager ?? false;
  const hasServiceWorker = environment.hasServiceWorker ?? false;
  const isSecureContext = environment.isSecureContext ?? false;
  const isStandalone = environment.isStandalone ?? false;
  const maxTouchPoints = environment.maxTouchPoints ?? 0;
  const userAgent = environment.userAgent ?? "";
  const permission = normalizePermission(hasNotification, environment.notificationPermission);
  const platform = detectNotificationPlatform({
    isStandalone,
    maxTouchPoints,
    userAgent,
  });

  let status: NotificationCapabilityStatus = "supported";
  let reasons: NotificationCapabilityReason[] = [];

  if (!isSecureContext) {
    status = "unsupported";
    reasons = ["insecure-context"];
  } else if (!hasNotification) {
    status = "unsupported";
    reasons = ["missing-notification-api"];
  } else if (!hasServiceWorker) {
    status = "unsupported";
    reasons = ["missing-service-worker"];
  } else if (platform === "ios-safari-tab") {
    status = "install-required";
    reasons = ["ios-safari-tab"];
  } else if (!hasPushManager) {
    status = "unsupported";
    reasons = ["missing-push-manager"];
  } else if (platform === "unsupported") {
    status = "unsupported";
    reasons = ["unsupported-platform"];
  }

  return {
    canRequestPermission: status === "supported" && permission === "default",
    canSubscribe: status === "supported" && permission === "granted",
    hasNotification,
    hasPushManager,
    hasServiceWorker,
    isSecureContext,
    permission,
    platform,
    reasons,
    status,
  };
}

function readNotificationCapabilityEnvironment(): NotificationCapabilityEnvironment {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const browserNavigator =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { standalone?: boolean });
  const hasNotification = typeof Notification !== "undefined";

  return {
    hasNotification,
    hasPushManager: typeof PushManager !== "undefined",
    hasServiceWorker: browserNavigator ? "serviceWorker" in browserNavigator : false,
    isSecureContext: browserWindow?.isSecureContext ?? false,
    isStandalone:
      (browserWindow?.matchMedia?.("(display-mode: standalone)").matches ?? false) ||
      browserNavigator?.standalone === true,
    maxTouchPoints: browserNavigator?.maxTouchPoints ?? 0,
    notificationPermission: hasNotification ? Notification.permission : undefined,
    userAgent: browserNavigator?.userAgent ?? "",
  };
}

function detectNotificationPlatform({
  isStandalone,
  maxTouchPoints,
  userAgent,
}: PlatformInput): NotificationCapabilityPlatform {
  if (isChromeAndroid(userAgent)) {
    return "chrome-android";
  }

  if (isIosSafari(userAgent, maxTouchPoints)) {
    return isStandalone ? "ios-safari-home-screen" : "ios-safari-tab";
  }

  return "unsupported";
}

function normalizePermission(
  hasNotification: boolean,
  permission: NotificationPermission | undefined,
): NotificationPermissionSnapshot {
  if (!hasNotification) {
    return "unavailable";
  }

  if (permission === "default" || permission === "denied" || permission === "granted") {
    return permission;
  }

  return "default";
}

function isChromeAndroid(userAgent: string): boolean {
  return (
    /Android/i.test(userAgent) &&
    /\b(?:Chrome|Chromium)\//.test(userAgent) &&
    !/\b(?:EdgA|Firefox|OPR|SamsungBrowser)\b/i.test(userAgent) &&
    !/[; ]wv\)/i.test(userAgent)
  );
}

function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const isIosDevice =
    /\b(?:iPad|iPhone|iPod)\b/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);

  return (
    isIosDevice &&
    /AppleWebKit/i.test(userAgent) &&
    /Safari\//i.test(userAgent) &&
    !/\b(?:CriOS|EdgiOS|FxiOS|OPiOS)\b/i.test(userAgent)
  );
}
