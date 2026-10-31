import { usernameSchema } from "@clc/core/features/signup/logic";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { identityClient } from "#/lib/api/identity";
import { cn } from "#/lib/utils";
import { translateValidationError } from "#/lib/validation-i18n";

const CHECK_DEBOUNCE_MS = 300;

export type UsernameOccupancy = {
  checking: boolean;
  taken: boolean;
};

/** A blank value is optional; the server assigns one. Anything else is checkable. */
function checkableUsername(value: string): string | null {
  const parsed = usernameSchema.safeParse(value);
  if (!parsed.success || parsed.data === "") return null;
  return parsed.data;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * The username field. A non-empty value is checked as it is typed: the spinner
 * sits in the input while the lookup runs, and a taken name is reported here.
 * The account's current name is not checked again. Nothing is reserved — saving
 * the profile is what claims it.
 */
export function UsernameInput({
  id,
  value,
  owned,
  onChange,
  onBlur,
  onOccupancy,
  error: validationError,
}: {
  id: string;
  value: string;
  /** The name this account already holds. It stays available to its owner. */
  owned?: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Lets the submit control wait out the lookup and a taken name. */
  onOccupancy?: (occupancy: UsernameOccupancy) => void;
  error?: string | null;
}) {
  const { i18n, t } = useLingui();
  const onOccupancyRef = useRef(onOccupancy);
  onOccupancyRef.current = onOccupancy;
  const [checking, setChecking] = useState(false);
  const [takenFor, setTakenFor] = useState<string | null>(null);
  const username = checkableUsername(value);
  const ownedName = owned ? checkableUsername(owned) : null;
  const taken = takenFor !== null && takenFor === username;
  const errorId = `${id}-error`;
  const takenMessage = taken
    ? translateValidationError("That username is already taken", i18n)
    : null;
  const error = validationError ?? takenMessage;

  useEffect(() => {
    if (!username || username === ownedName) {
      setChecking(false);
      setTakenFor(null);
      onOccupancyRef.current?.({ checking: false, taken: false });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setChecking(true);
    setTakenFor(null);
    onOccupancyRef.current?.({ checking: true, taken: false });
    const timer = window.setTimeout(() => {
      void identityClient.getAvailability({ username }, { signal: controller.signal }).then(
        (result) => {
          if (cancelled) return;
          const isTaken = result.username?.available === false;
          setChecking(false);
          setTakenFor(isTaken ? username : null);
          onOccupancyRef.current?.({ checking: false, taken: isTaken });
        },
        (lookupError: unknown) => {
          if (cancelled || isAbortError(lookupError)) return;
          // The save repeats the check. A failed lookup must not block the form.
          setChecking(false);
          setTakenFor(null);
          onOccupancyRef.current?.({ checking: false, taken: false });
        },
      );
    }, CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [username, ownedName]);

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
          aria-busy={checking || undefined}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(checking && "pe-9")}
        />
        {checking ? (
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
