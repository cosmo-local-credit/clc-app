import { useSyncExternalStore } from "react";

let reconnectAttempted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function markReconnectAttempted(): void {
  if (reconnectAttempted) return;
  reconnectAttempted = true;
  emit();
}

export function resetReconnectAttemptedForTest(): void {
  reconnectAttempted = false;
  emit();
}

export function getReconnectAttemptedSnapshot(): boolean {
  return reconnectAttempted;
}

export function useReconnectAttempted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getReconnectAttemptedSnapshot,
    () => false,
  );
}
