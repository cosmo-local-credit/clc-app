import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { recipientsClient } from "#/lib/api/recipients";
import { cn } from "#/lib/utils";

/** How long the name stays still before the old Suggest action runs on its own. */
const SUGGEST_PAUSE_MS = 600;

/** A handle, not the display name: lowercase, words joined by dashes. */
function usernameHint(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).filter(Boolean).join("-");
}

/**
 * Username. Once the person's name has been still, or they leave it, this asks
 * for a free handle the way the old Suggest button did and fills it in. The
 * spinner shows while that lookup runs. A handle they type themselves is left
 * alone, so a taken or unwanted suggestion can be changed.
 */
export function UsernameInput({
  id,
  value,
  name = "",
  onChange,
  onBlur,
  onPending,
  settleRef,
  error,
}: {
  id: string;
  value: string;
  /** The display name. A suggestion is taken from this once typing has finished. */
  name?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** True while the suggestion lookup for the finished name is in flight. */
  onPending?: (pending: boolean) => void;
  /**
   * Set to a function that runs the suggestion now. The name field calls it on
   * blur, and Continue calls it so leaving the page does not drop the result.
   */
  settleRef?: { current: (() => Promise<void>) | null };
  error?: string | null;
}) {
  const { t } = useLingui();
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;
  const hint = usernameHint(name);
  const hintRef = useRef(hint);
  hintRef.current = hint;
  const suggestionRef = useRef<string | null>(null);
  const appliedHintRef = useRef<string | null>(null);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const flightRef = useRef<Promise<void> | null>(null);
  const flightHintRef = useRef<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const errorId = `${id}-error`;

  const runRef = useRef<() => Promise<void>>(async () => {});
  runRef.current = () => {
    const hintNow = hintRef.current;
    const untouched = () => valueRef.current === "" || valueRef.current === suggestionRef.current;
    if (!hintNow || !untouched()) {
      requestId.current += 1;
      abortRef.current?.abort();
      flightRef.current = null;
      flightHintRef.current = null;
      setSuggesting(false);
      onPendingRef.current?.(false);
      return Promise.resolve();
    }
    if (appliedHintRef.current === hintNow) return Promise.resolve();
    if (flightRef.current && flightHintRef.current === hintNow) return flightRef.current;

    requestId.current += 1;
    const id = requestId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    flightHintRef.current = hintNow;
    setSuggesting(true);
    onPendingRef.current?.(true);
    const atRequest = valueRef.current;
    // Abort has to settle this promise even when the client ignores the signal,
    // or Continue would wait on a lookup for a name that is no longer current.
    const flight = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      controller.signal.addEventListener("abort", finish, { once: true });
      recipientsClient.suggest(hintNow, controller.signal).then(
        (suggestion) => {
          if (id === requestId.current && !controller.signal.aborted) {
            if (valueRef.current === atRequest || valueRef.current === suggestionRef.current) {
              suggestionRef.current = suggestion;
              appliedHintRef.current = hintNow;
              if (valueRef.current !== suggestion) onChangeRef.current(suggestion);
            }
          }
          finish();
        },
        () => finish(),
      );
    }).finally(() => {
      if (id !== requestId.current) return;
      flightRef.current = null;
      flightHintRef.current = null;
      setSuggesting(false);
      onPendingRef.current?.(false);
    });
    flightRef.current = flight;
    return flight;
  };

  useEffect(() => {
    if (!settleRef) return;
    settleRef.current = () => runRef.current();
    return () => {
      settleRef.current = null;
    };
  }, [settleRef]);

  useEffect(() => {
    // A name that is still changing supersedes a lookup for the previous one.
    requestId.current += 1;
    abortRef.current?.abort();
    setSuggesting(false);
    onPendingRef.current?.(false);

    const untouched = valueRef.current === "" || valueRef.current === suggestionRef.current;
    if (!hint || !untouched) return;
    const timer = window.setTimeout(() => {
      void runRef.current();
    }, SUGGEST_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="font-medium text-sm">
        {t`Username`}
      </label>
      <div className="relative">
        <Input
          id={id}
          dir="auto"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-busy={suggesting || undefined}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(suggesting && "pe-9")}
        />
        {suggesting ? (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-muted-foreground">
            <Spinner />
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
