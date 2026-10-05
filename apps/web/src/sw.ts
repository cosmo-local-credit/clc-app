/// <reference lib="webworker" />
import type { AppBuildInfo } from "@clc/core/features/app-updates/logic";
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";
import { registerNotificationServiceWorkerHandlers } from "./features/notifications/sw/register-handlers";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    /** QA: evaluate `clcBuildInfo` in this worker's devtools console. */
    clcBuildInfo: AppBuildInfo;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Assigned rather than merely referenced so the minifier keeps it. Release
// identity only: the notification protocol versions itself separately.
self.clcBuildInfo = __CLC_BUILD_INFO__;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
});

registerNotificationServiceWorkerHandlers(self);
serwist.addEventListeners();
