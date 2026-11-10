import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

/**
 * Closing an inspector whose state lives in the URL.
 *
 * Opening the first inspector pushes a history entry (the page calls
 * `markPushed`); switching to another replaces it. Closing then pops exactly
 * what this page pushed, so Back lands where the person came from. A direct
 * link pushed nothing: there is no earlier entry that belongs to this page, so
 * closing goes to the page's own parent destination instead of leaving the app
 * or doing nothing.
 */
export function useInspectorHistory(open: boolean, toParent: () => void) {
  const router = useRouter();
  const pushed = useRef(false);

  // A closed inspector (the Back button, a link) forgets the push it made.
  useEffect(() => {
    if (!open) pushed.current = false;
  }, [open]);

  const markPushed = useCallback(() => {
    pushed.current = true;
  }, []);

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      router.history.back();
      return;
    }
    toParent();
  }, [router, toParent]);

  return { markPushed, close };
}
