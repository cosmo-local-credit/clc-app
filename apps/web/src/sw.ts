/// <reference lib="webworker" />
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";
import { registerNotificationServiceWorkerHandlers } from "./features/notifications/sw/register-handlers";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
});

registerNotificationServiceWorkerHandlers(self);
serwist.addEventListeners();
