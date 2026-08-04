import { useEffect, useState } from "react";

const CATALOG_FILTER_DEBOUNCE_MS = 250;

/**
 * Settles `value` after `delayMs` of quiet. `isPending` is true while the caller holds a value the
 * settled one has not caught up to, which lets a consumer show "refining" without a second timer.
 */
export function useDebouncedValue<T>(value: T, delayMs = CATALOG_FILTER_DEBOUNCE_MS) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return { settled, isPending: settled !== value };
}
