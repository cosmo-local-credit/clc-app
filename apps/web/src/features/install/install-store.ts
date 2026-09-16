import { useEffect } from "react";
import { create } from "zustand";
import type { InstallSnapshot } from "./install-bootstrap";

export const useInstallStore = create<InstallSnapshot>(() => ({
  installed: false,
  promptEvent: null,
  status: "idle",
}));

export function updateInstallState(update: Partial<InstallSnapshot>) {
  if (window.__clcInstall) Object.assign(window.__clcInstall, update);
  useInstallStore.setState(update);
}

// React only subscribes to the early capture; it never owns native prompting.
export function initializeInstallEvents() {
  const media = window.matchMedia?.("(display-mode: standalone)");
  const sync = () => {
    if (window.__clcInstall) useInstallStore.setState(window.__clcInstall);
    if (media?.matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
      updateInstallState({ installed: true, promptEvent: null, status: "idle" });
    }
  };
  sync();
  window.addEventListener("clc-install-change", sync);
  media?.addEventListener("change", sync);
  return () => {
    window.removeEventListener("clc-install-change", sync);
    media?.removeEventListener("change", sync);
  };
}

export function useInstallPromptListener() {
  useEffect(initializeInstallEvents, []);
}
