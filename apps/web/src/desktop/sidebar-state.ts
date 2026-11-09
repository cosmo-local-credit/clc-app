import { useSyncExternalStore } from "react";

const SIDEBAR_STORAGE_KEY = "clc.desktop.sidebar";

type SidebarMode = "expanded" | "collapsed";

const listeners = new Set<() => void>();

function readMode(): SidebarMode {
  if (typeof window === "undefined") return "expanded";
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed"
      ? "collapsed"
      : "expanded";
  } catch {
    return "expanded";
  }
}

function writeMode(mode: SidebarMode) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, mode);
  } catch {
    // A private window still toggles for this document.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarCollapsed() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "expanded" as const);
  return {
    collapsed: mode === "collapsed",
    toggle: () => writeMode(readMode() === "collapsed" ? "expanded" : "collapsed"),
  };
}
