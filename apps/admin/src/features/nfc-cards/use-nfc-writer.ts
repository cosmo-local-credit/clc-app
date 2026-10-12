import {
  classifyOccupiedCard,
  createWriterModel,
  issuanceCounts,
  type WriterContext,
  type WriterEvent,
  type WriterModel,
  writerTransition,
} from "@clc/core/features/nfc/issuance";
import {
  classifyNfcError,
  type NfcReading,
  nfcReadingMatchesUrl,
  readNfcCardContent,
  summarizeDurations,
} from "@clc/core/features/nfc/logic";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  createNdefScanner,
  createNdefWriter,
  getNdefReaderConstructor,
  type NdefReaderConstructor,
  queryNfcPermission,
} from "#/lib/nfc/ndef-adapter";
import type { BatchWallet } from "#/features/paper-wallets/use-paper-wallet-batch";

/**
 * Registered rows to have in hand before the first card. Preparation keeps
 * refilling the queue behind the writer, so the operator never waits on a
 * single registration between cards.
 */
const READY_BUFFER = 5;

const DEFAULT_TIMING = {
  /** How long a held card has to read back before the operator is asked to tap again. */
  verifyWindowMs: 2_000,
  /** Pause before re-arming a refused card's row, so a card left on the reader is not hammered. */
  rearmDelayMs: 1_000,
};

export type NfcWriterStats = {
  /** Card detected → write resolved, where the platform reported the detection. */
  writeP50: number | null;
  writeP95: number | null;
  /** Write resolved → matching read-back. Verification overhead, reported on its own. */
  verifyP50: number | null;
  cardsPerMinute: number | null;
};

const EMPTY_STATS: NfcWriterStats = {
  writeP50: null,
  writeP95: null,
  verifyP50: null,
  cardsPerMinute: null,
};

type UseNfcWriterInput = {
  wallets: readonly BatchWallet[];
  /** Rows are still being encrypted or registered. */
  preparing: boolean;
  urlFor: (rowId: number) => string | null;
  rowForUrl: (url: string) => number | null;
  /** The platform reader, resolved when an operation starts. Injected by tests. */
  getReader?: () => NdefReaderConstructor | null;
  queryPermission?: () => Promise<"granted" | "denied" | "prompt" | null>;
  timing?: Partial<typeof DEFAULT_TIMING>;
};

/** Anonymous per-operation marks for the hardware pilot. Never a payload, never an address. */
function mark(session: string, armId: number, stage: string) {
  if (typeof performance !== "undefined")
    performance.mark?.(`clc-nfc:${session}:${armId}:${stage}`);
}

/**
 * Drives the card writer: one physical write at a time, every effect keyed on
 * the arm id `writerTransition` hands out, so each armed operation runs once
 * and a late result for an earlier arm is ignored by the state machine.
 *
 * Three readers can exist, never at once for the same purpose:
 *
 * - the write itself, armed for one row;
 * - an observation scan while a write waits, which only records what the last
 *   card held — it can classify a refusal, never assign a wallet;
 * - a fresh verification scan, started only after the write resolved, whose
 *   first reading is compared to the exact prepared record.
 *
 * A reading that arrives under any other phase is dropped by that gate.
 */
export function useNfcWriter({
  wallets,
  preparing,
  urlFor,
  rowForUrl,
  getReader = getNdefReaderConstructor,
  queryPermission = queryNfcPermission,
  timing,
}: UseNfcWriterInput) {
  const { verifyWindowMs, rearmDelayMs } = { ...DEFAULT_TIMING, ...timing };
  const readyIds = useMemo(
    () =>
      wallets
        .filter((wallet) => wallet.status === "ready")
        .map((wallet) => wallet.id)
        .sort((a, b) => a - b),
    [wallets],
  );
  const eligible = wallets.filter((wallet) => wallet.status !== "failed").length;
  const context = useMemo<WriterContext>(() => ({ readyIds, preparing }), [readyIds, preparing]);
  const contextRef = useRef(context);

  const modelRef = useRef<WriterModel>(createWriterModel(true));
  const [model, setModel] = useState(modelRef.current);
  const [stats, setStats] = useState<NfcWriterStats>(EMPTY_STATS);
  const [lastWritten, setLastWritten] = useState<{ rowId: number; at: number } | null>(null);

  const sessionRef = useRef(Math.random().toString(36).slice(2, 10));
  const observedRef = useRef<{ reading: NfcReading; at: number } | null>(null);
  const previousCardRef = useRef<{ serialNumber: string | null; url: string } | null>(null);
  const writtenAtRef = useRef(0);
  const writeDurationsRef = useRef<number[]>([]);
  const verifyDurationsRef = useRef<number[]>([]);
  const successTimesRef = useRef<number[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  // Synchronous on purpose: the ref is the latch. A duplicate event in the same
  // tick sees the model the first one produced, not a stale render.
  const dispatch = useCallback((event: WriterEvent) => {
    const next = writerTransition(modelRef.current, event, contextRef.current);
    if (next === modelRef.current) return;
    modelRef.current = next;
    setModel(next);
  }, []);

  useEffect(() => {
    contextRef.current = context;
    dispatch({ type: "rows-changed" });
  }, [context, dispatch]);

  const refreshStats = useCallback(() => {
    const writes = summarizeDurations(writeDurationsRef.current);
    const verifies = summarizeDurations(verifyDurationsRef.current);
    const times = successTimesRef.current;
    const span = times.length >= 2 ? (times[times.length - 1] as number) - (times[0] as number) : 0;
    setStats({
      writeP50: writes.p50,
      writeP95: writes.p95,
      verifyP50: verifies.p50,
      cardsPerMinute: span > 0 ? ((times.length - 1) / span) * 60_000 : null,
    });
  }, []);

  const feedback = useCallback(() => {
    navigator.vibrate?.(60);
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.08);
    } catch {
      // Sound is a courtesy; the status area carries the same news.
    }
  }, []);

  const phase = model.phase;
  const observing = phase.phase === "waiting" || phase.phase === "blocked";
  const waitingArm = phase.phase === "waiting" ? phase.armId : null;
  const verifyingArm = phase.phase === "verifying" ? phase.armId : null;
  const blockedArm = phase.phase === "blocked" ? phase.armId : null;

  // Observation: while a write waits, remember what the card in the field held.
  const runObservation = useEffectEvent((signal: AbortSignal) => {
    const Reader = getReader();
    if (!Reader) return;
    createNdefScanner(Reader)
      .scan(
        {
          onReading: (reading) => {
            observedRef.current = { reading, at: performance.now() };
          },
          onReadingError: () => {},
        },
        signal,
      )
      .catch((error: unknown) => {
        if (signal.aborted) return;
        const kind = classifyNfcError(error, { operation: "scan" });
        // Observation is best-effort: the write still refuses a non-blank card
        // without it. Only a failure the write would also hit stops the writer.
        if (kind === "permission-denied" || kind === "disabled" || kind === "unsupported") {
          dispatch({ type: "fail", error: kind });
        }
      });
  });

  useEffect(() => {
    if (!observing) return;
    const controller = new AbortController();
    runObservation(controller.signal);
    return () => controller.abort();
  }, [observing]);

  const runWrite = useEffectEvent((signal: AbortSignal) => {
    const current = modelRef.current.phase;
    if (current.phase !== "waiting") return;
    const { rowId, overwrite, armId } = current;
    const Reader = getReader();
    if (!Reader) {
      dispatch({ type: "fail", error: "unsupported" });
      return;
    }
    const url = urlFor(rowId);
    if (!url) {
      dispatch({ type: "write-failed", rowId, error: "unknown" });
      return;
    }
    const armedAt = performance.now();
    observedRef.current = null;
    const session = sessionRef.current;
    mark(session, armId, "armed");
    const observedSinceArm = () => {
      const observed = observedRef.current;
      return observed && observed.at >= armedAt ? observed : null;
    };

    createNdefWriter(Reader)
      .writeUrl(url, { overwrite, signal })
      .then(
        () => {
          if (signal.aborted) return;
          const finishedAt = performance.now();
          const observed = observedSinceArm();
          if (observed) writeDurationsRef.current.push(finishedAt - observed.at);
          successTimesRef.current.push(Date.now());
          writtenAtRef.current = finishedAt;
          previousCardRef.current = { serialNumber: observed?.reading.serialNumber ?? null, url };
          mark(session, armId, "written");
          refreshStats();
          feedback();
          setLastWritten({ rowId, at: Date.now() });
          dispatch({ type: "write-succeeded", rowId });
        },
        async (error: unknown) => {
          if (signal.aborted) return;
          // Also lets the reading the platform dispatched during the write land.
          const permission = await queryPermission();
          if (signal.aborted) return;
          const observed = observedSinceArm()?.reading ?? null;
          const kind = classifyNfcError(error, {
            operation: "write",
            permission,
            tagHadRecords: observed ? readNfcCardContent(observed).kind !== "blank" : undefined,
          });
          mark(session, armId, `failed-${kind}`);
          dispatch({
            type: "write-failed",
            rowId,
            error: kind,
            occupied:
              kind === "tag-occupied" && observed
                ? classifyOccupiedCard({
                    observed,
                    previousCard: previousCardRef.current,
                    rowForUrl,
                  })
                : undefined,
          });
        },
      );
  });

  useEffect(() => {
    if (waitingArm === null) return;
    const controller = new AbortController();
    runWrite(controller.signal);
    return () => controller.abort();
  }, [waitingArm]);

  // Verification: a fresh scan, started only now that the write has resolved.
  const runVerify = useEffectEvent((signal: AbortSignal) => {
    const current = modelRef.current.phase;
    if (current.phase !== "verifying") return () => {};
    const { rowId, retap, armId } = current;
    const url = urlFor(rowId);
    const Reader = getReader();
    if (!Reader || !url) {
      dispatch({ type: "fail", error: "unsupported" });
      return () => {};
    }
    createNdefScanner(Reader)
      .scan(
        {
          onReading: (reading) => {
            const now = modelRef.current.phase;
            if (now.phase !== "verifying" || now.rowId !== rowId) return;
            const matches = nfcReadingMatchesUrl(reading, url);
            if (matches) verifyDurationsRef.current.push(performance.now() - writtenAtRef.current);
            mark(sessionRef.current, armId, matches ? "verified" : "mismatch");
            refreshStats();
            dispatch({ type: "verify-read", rowId, matches });
          },
          // An unreadable tag is not an empty one, and not a mismatch either.
          onReadingError: () => {},
        },
        signal,
      )
      .catch((error: unknown) => {
        if (signal.aborted) return;
        const kind = classifyNfcError(error, { operation: "scan" });
        if (kind === "permission-denied" || kind === "disabled" || kind === "unsupported") {
          dispatch({ type: "fail", error: kind });
        }
      });
    if (retap) return () => {};
    const timer = window.setTimeout(
      () => dispatch({ type: "verify-timeout", rowId }),
      verifyWindowMs,
    );
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    if (verifyingArm === null) return;
    const controller = new AbortController();
    const clearTimer = runVerify(controller.signal);
    return () => {
      controller.abort();
      clearTimer();
    };
  }, [verifyingArm]);

  useEffect(() => {
    if (blockedArm === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "rearm", armId: blockedArm }),
      rearmDelayMs,
    );
    return () => window.clearTimeout(timer);
  }, [blockedArm, dispatch, rearmDelayMs]);

  // Chrome suspends NFC on a hidden page anyway; pausing makes the return an
  // explicit Resume instead of a write armed against whatever is nearby.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [dispatch]);

  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => {});
    },
    [],
  );

  const start = useCallback(() => {
    // Created inside the tap, where browsers allow audio to start.
    if (!audioRef.current && typeof AudioContext !== "undefined") {
      try {
        audioRef.current = new AudioContext();
      } catch {
        audioRef.current = null;
      }
    }
    dispatch({ type: "start" });
  }, [dispatch]);

  const reset = useCallback(() => {
    modelRef.current = createWriterModel(modelRef.current.verify, modelRef.current.overwrite);
    setModel(modelRef.current);
    observedRef.current = null;
    previousCardRef.current = null;
    writeDurationsRef.current = [];
    verifyDurationsRef.current = [];
    successTimesRef.current = [];
    setStats(EMPTY_STATS);
    setLastWritten(null);
  }, []);

  const counts = issuanceCounts(model, readyIds);
  const readyThreshold = Math.min(READY_BUFFER, eligible);
  const canStart = readyIds.length > 0 && (!preparing || readyIds.length >= readyThreshold);

  return {
    model,
    readyIds,
    counts,
    canStart,
    readyThreshold,
    stats,
    lastWritten,
    start,
    reset,
    pause: useCallback(() => dispatch({ type: "pause" }), [dispatch]),
    retry: useCallback(() => dispatch({ type: "retry" }), [dispatch]),
    setAside: useCallback(() => dispatch({ type: "set-aside" }), [dispatch]),
    skipRow: useCallback(() => dispatch({ type: "skip-row" }), [dispatch]),
    keepUnverified: useCallback(() => dispatch({ type: "skip-verify" }), [dispatch]),
    rewrite: useCallback((rowId: number) => dispatch({ type: "rewrite", rowId }), [dispatch]),
    requeueSkipped: useCallback(() => dispatch({ type: "requeue-skipped" }), [dispatch]),
    setVerify: useCallback(
      (verify: boolean) => dispatch({ type: "set-verify", verify }),
      [dispatch],
    ),
    setOverwrite: useCallback(
      (overwrite: boolean) => dispatch({ type: "set-overwrite", overwrite }),
      [dispatch],
    ),
  };
}

export type NfcWriterController = ReturnType<typeof useNfcWriter>;
