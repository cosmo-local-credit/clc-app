import type { PWAInstallElement } from "@khmyznikov/pwa-install";
import type { InstallPromptEvent } from "./install-bootstrap";
import { updateInstallState, useInstallStore } from "./install-store";

let modulePromise: Promise<typeof import("@khmyznikov/pwa-install")> | undefined;

export function preloadInstallDialog() {
  // Called only by a mounted install CTA, never during SSR or root startup.
  modulePromise ??= import("@khmyznikov/pwa-install").catch((error: unknown) => {
    modulePromise = undefined;
    throw error;
  });
  return modulePromise;
}

export function createInstallDialog() {
  let element: PWAInstallElement | undefined;
  let unsubscribe: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  let disposed = false;
  const lifetime = new AbortController();

  function removeElement() {
    unsubscribe?.();
    unsubscribe = undefined;
    element?.remove();
    element = undefined;
  }

  async function open() {
    if (disposed || useInstallStore.getState().installed) return;
    if (pending) return pending;
    if (element && !element.isDialogHidden) return;
    if (useInstallStore.getState().status === "prompting") return;
    pending = (async () => {
      removeElement();
      await preloadInstallDialog();
      if (disposed || useInstallStore.getState().installed) return;
      const dialog = document.createElement("pwa-install") as PWAInstallElement;
      element = dialog;
      dialog.manualApple = true;
      dialog.manualChrome = true;
      dialog.manifestUrl = "/manifest.json";
      dialog.setAttribute("lang", navigator.language);
      // This is a JS property, not an HTML attribute. The root owns capture;
      // the library owns prompt(), including its user-gesture requirement.
      dialog.externalPromptEvent = useInstallStore.getState()
        .promptEvent as PWAInstallElement["externalPromptEvent"];
      let activePrompt: InstallPromptEvent | null | undefined;
      const isStaleResult = () => {
        const state = useInstallStore.getState();
        return (
          state.installed ||
          (activePrompt !== undefined &&
            state.promptEvent !== null &&
            state.promptEvent !== activePrompt)
        );
      };
      dialog.addEventListener("pwa-install-backend-event", (event) => {
        const { backend } = (event as CustomEvent<{ backend: string }>).detail;
        activePrompt = useInstallStore.getState().promptEvent;
        // Keep the legacy event during a Web Install attempt: the library can
        // offer it on a second tap if that newer browser API fails.
        updateInstallState({
          status: "prompting",
          ...(backend === "beforeinstallprompt" ? { promptEvent: null } : {}),
        });
      });
      dialog.addEventListener("pwa-user-choice-result-event", (event) => {
        const { message } = (event as CustomEvent<{ message: string }>).detail;
        if (!isStaleResult() && (message === "accepted" || message === "dismissed")) {
          updateInstallState({
            status: message,
            ...(message === "accepted" ? { promptEvent: null } : {}),
          });
        }
      });
      dialog.addEventListener("pwa-install-fail-event", (event) => {
        if (isStaleResult()) return;
        const { fallbackAvailable } = (event as CustomEvent<{ fallbackAvailable?: boolean }>)
          .detail;
        updateInstallState({
          status: "error",
          ...(!fallbackAvailable ? { promptEvent: null } : {}),
        });
        if (!fallbackAvailable) dialog.hideDialog();
      });
      unsubscribe = useInstallStore.subscribe((state) => {
        dialog.externalPromptEvent = state.promptEvent as PWAInstallElement["externalPromptEvent"];
        // A browser-menu action can consume the event too. Merely assigning
        // null does not clear the library's internal copy; hide this sheet and
        // recreate it on the next open so it cannot reuse that stale event.
        if (state.installed || state.status === "accepted" || state.status === "dismissed")
          dialog.hideDialog();
      });
      document.body.append(dialog);
      // connectedCallback awaits platform checks and the manifest before Lit
      // begins its first update. Don't open a sheet initialization will hide.
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => finish(new Error("Install dialog initialization timed out")),
          10_000,
        );
        const abort = () => finish(new Error("Install dialog disposed"));
        const finish = (error?: unknown) => {
          window.clearTimeout(timeout);
          lifetime.signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve();
        };
        lifetime.signal.addEventListener("abort", abort, { once: true });
        void dialog.updateComplete.then(() => finish(), finish);
      });
      if (disposed || useInstallStore.getState().installed) return;
      if (
        !dialog.isInstallAvailable &&
        !dialog.isAppleMobilePlatform &&
        !dialog.isAppleDesktopPlatform &&
        !dialog.isAndroid
      ) {
        throw new Error("Install instructions unavailable for this browser");
      }
      // Apple and Android fallback availability may arrive shortly after the
      // first update. showDialog() preserves their availability checks.
      dialog.showDialog();
    })()
      .catch((error: unknown) => {
        removeElement();
        throw error;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  return {
    open,
    dispose() {
      disposed = true;
      lifetime.abort();
      removeElement();
    },
  };
}
