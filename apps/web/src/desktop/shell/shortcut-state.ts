import { useSyncExternalStore } from "react";

/**
 * Whether the desktop's single-key shortcuts (`/`, `[`, `?`, J, K, G then M/W/A)
 * are on. They are on by default and persisted like the sidebar state. A person
 * who dictates, or who types with a switch device, can turn them off; the
 * modified Ctrl/⌘ K and Escape stay, because they are not character keys.
 */
const SHORTCUTS_STORAGE_KEY = "clc.desktop.shortcuts";

const listeners = new Set<() => void>();
// Where storage is blocked the choice still holds for this document.
let session: boolean | null = null;

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return session ?? true;
  }
}

function writeEnabled(enabled: boolean) {
  session = enabled;
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Kept in `session` above.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCharacterShortcuts() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);
  return { enabled, setEnabled: writeEnabled };
}
