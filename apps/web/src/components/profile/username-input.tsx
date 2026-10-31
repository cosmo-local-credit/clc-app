import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { recipientsClient } from "#/lib/api/recipients";
import { cn } from "#/lib/utils";

const SUGGEST_DEBOUNCE_MS = 300;

/** A handle, not the display name: lowercase, words joined by dashes. */
function usernameHint(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).filter(Boolean).join("-");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Username. Typing the person's name fills a free handle here. The spinner
 * sits in the field while that suggestion is looked up. A handle the person
 * types themselves is left alone, so a taken suggestion or one they do not
 * want can be replaced.
 */
export function UsernameInput({
  id,
  value,
  name = "",
  onChange,
  onBlur,
  onPending,
  error,
}: {
  id: string;
  value: string;
  /** The display name being typed. A suggestion is taken from this, not from the handle. */
  name?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** True while a suggestion for the current name is still being looked up. */
  onPending?: (pending: boolean) => void;
  error?: string | null;
}) {
  const { t } = useLingui();
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;
  const suggestionRef = useRef<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const errorId = `${id}-error`;
  const hint = usernameHint(name);

  useEffect(() => {
    const untouched = () => valueRef.current === "" || valueRef.current === suggestionRef.current;
    if (!hint || !untouched()) {
      setSuggesting(false);
      onPendingRef.current?.(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setSuggesting(true);
    onPendingRef.current?.(true);
    const timer = window.setTimeout(() => {
      if (!untouched()) {
        setSuggesting(false);
        onPendingRef.current?.(false);
        return;
      }
      const atRequest = valueRef.current;
      void recipientsClient.suggest(hint, controller.signal).then(
        (suggestion) => {
          if (cancelled) return;
          setSuggesting(false);
          onPendingRef.current?.(false);
          if (valueRef.current !== atRequest && valueRef.current !== suggestionRef.current) return;
          suggestionRef.current = suggestion;
          if (valueRef.current !== suggestion) onChangeRef.current(suggestion);
        },
        (lookupError: unknown) => {
          if (cancelled || isAbortError(lookupError)) return;
          setSuggesting(false);
          onPendingRef.current?.(false);
        },
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
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
