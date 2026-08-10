import { useLingui } from "@lingui/react/macro";
import type * as React from "react";

import { translateValidationError } from "#/lib/validation-i18n";

/**
 * Label + control + hint/error row. `error` carries the raw message from a
 * `@clc/core` schema; it is translated here so callers never have to.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block font-medium text-sm">
        {label}
      </label>
      {children}
      {error ? (
        <FieldError error={error} />
      ) : hint ? (
        <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldError({ error }: { error: string }) {
  const { i18n } = useLingui();
  return (
    <p className="mt-1 text-destructive text-xs" role="alert">
      {translateValidationError(error, i18n)}
    </p>
  );
}
