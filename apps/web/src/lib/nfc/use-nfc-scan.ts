import {
  classifyNfcError,
  type NfcErrorKind,
  type NfcReading,
  type NfcSessionEvent,
  type NfcSessionPhase,
  nextNfcSessionPhase,
} from "@clc/core/features/nfc/logic";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  claimNfc,
  createNfcScanner,
  getNdefReaderConstructor,
  type NdefReaderConstructor,
  releaseNfc,
} from "./ndef-adapter";
import { markNfc } from "./metrics";

/** What a workflow tells the session after handling a tag. */
export type NfcTagOutcome = "done" | "continue";

export type UseNfcScanOptions = {
  /**
   * Called once per accepted tag. While it runs the session is `handling` and
   * every other tag is dropped. Return `"done"` to end the session (a login
   * needs one card) or `"continue"` to keep listening (collection).
   */
  onTag: (reading: NfcReading) => NfcTagOutcome | Promise<NfcTagOutcome>;
  /** Injected in tests; the browser's `NDEFReader` otherwise. */
  Reader?: NdefReaderConstructor | null;
};

/**
 * One cancellable scan session, owned by the calling workflow.
 *
 * - `start()` must run inside the click that asks for it: the first scan shows
 *   the permission prompt, which needs that gesture. A denial is reported, not
 *   retried.
 * - The lifecycle lives in a ref advanced synchronously, so a second tag that
 *   arrives while the first is being handled is dropped before anything awaits.
 * - Every session has a generation; a callback from an earlier one — a late
 *   reading, a scan that resolves after cancel — finds it stale and does nothing.
 * - Leaving the page visible state, unmounting, or `stop()` aborts the session
 *   and detaches its listeners. Hiding the page ends it as `cancelled`, and the
 *   workflow shows an explicit way to start again rather than resuming silently.
 */
export function useNfcScan({ onTag, Reader }: UseNfcScanOptions) {
  const [phase, setPhase] = useState<NfcSessionPhase>("idle");
  const [error, setError] = useState<NfcErrorKind | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const phaseRef = useRef<NfcSessionPhase>("idle");
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const advance = useCallback((event: NfcSessionEvent) => {
    const next = nextNfcSessionPhase(phaseRef.current, event);
    phaseRef.current = next;
    setPhase(next);
    return next;
  }, []);

  const end = useCallback(() => {
    generationRef.current += 1;
    const controller = controllerRef.current;
    controllerRef.current = null;
    if (controller) releaseNfc(controller);
  }, []);

  const stop = useCallback(() => {
    end();
    advance({ type: "cancel" });
  }, [advance, end]);

  // Read through a ref so a new callback identity never restarts the reader.
  const onTagRef = useRef(onTag);
  useEffect(() => {
    onTagRef.current = onTag;
  });

  const start = useCallback(() => {
    end();
    setError(null);
    setReadFailed(false);
    const ReaderConstructor = Reader === undefined ? getNdefReaderConstructor() : Reader;
    advance({ type: "start" });
    if (!ReaderConstructor) {
      setError("unsupported");
      advance({ type: "fail" });
      return;
    }

    const generation = generationRef.current;
    const controller = claimNfc();
    controllerRef.current = controller;
    const current = () => generation === generationRef.current && !controller.signal.aborted;

    void createNfcScanner(ReaderConstructor)
      .scan(
        {
          onReading: (reading) => {
            if (!current()) return;
            // No transition means a tag is already being handled, or the
            // session is not listening: either way this one is dropped.
            if (nextNfcSessionPhase(phaseRef.current, { type: "tag" }) === phaseRef.current) return;
            advance({ type: "tag" });
            setReadFailed(false);
            void Promise.resolve()
              .then(() => onTagRef.current(reading))
              .catch((): NfcTagOutcome => "continue")
              .then((outcome) => {
                if (!current()) return;
                advance({ type: "handled", done: outcome === "done" });
                if (outcome === "done") end();
              });
          },
          onReadingError: () => {
            if (current()) setReadFailed(true);
          },
        },
        controller.signal,
      )
      .then(
        () => {
          if (!current()) return;
          advance({ type: "started" });
          markNfc(crypto.randomUUID(), "ready");
        },
        (scanError: unknown) => {
          if (!current()) return;
          const kind = classifyNfcError(scanError, { operation: "scan" });
          end();
          if (kind === "aborted") {
            advance({ type: "cancel" });
            return;
          }
          setError(kind);
          advance({ type: "fail" });
        },
      );
  }, [Reader, advance, end]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && controllerRef.current) stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      end();
    };
  }, [end, stop]);

  return { phase, error, readFailed, start, stop };
}
