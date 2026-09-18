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

let installAttempt = 0;

// Called directly by the dialog's button: no import or await may precede
// prompt(), which requires a fresh browser user gesture.
export async function requestInstall() {
  const { promptEvent, installed, status } = useInstallStore.getState();
  if (!promptEvent || installed || status === "prompting") return;
  const attempt = ++installAttempt;
  updateInstallState({ promptEvent: null, status: "prompting" });
  const stillCurrent = () => {
    const state = useInstallStore.getState();
    return (
      attempt === installAttempt &&
      !state.installed &&
      state.status === "prompting" &&
      state.promptEvent === null
    );
  };
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (stillCurrent()) updateInstallState({ status: outcome });
  } catch {
    if (stillCurrent()) updateInstallState({ status: "error" });
  }
}

// Subscribe to the early capture without registering another browser prompt listener.
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
