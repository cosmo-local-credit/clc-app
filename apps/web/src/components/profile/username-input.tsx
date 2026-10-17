import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { recipientsClient } from "#/lib/api/recipients";

/** Suggestions are read-only; saving the profile claims the current name. */
export function UsernameInput({
  id,
  value,
  hint,
  onChange,
  onBlur,
  error: validationError,
}: {
  id: string;
  value: string;
  hint: () => string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string | null;
}) {
  const currentValue = useRef(value);
  currentValue.current = value;
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const errorId = `${id}-error`;
  const error = validationError ?? suggestionError;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="font-medium text-sm">
        {t`Username`}
      </label>
      <Input
        id={id}
        dir="auto"
        value={value}
        onChange={(event) => {
          setSuggestionError(null);
          onChange(event.target.value);
        }}
        onBlur={onBlur}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(validationError)}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button
        type="button"
        variant="outline"
        tap
        pending={busy}
        onClick={async () => {
          const before = currentValue.current;
          setBusy(true);
          setSuggestionError(null);
          try {
            const suggestion = await recipientsClient.suggest(hint());
            if (currentValue.current === before) onChange(suggestion);
          } catch {
            setSuggestionError(t`Couldn't suggest a username. Please try again.`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t`Finding a name…` : t`Suggest username`}
      </Button>
      {error ? (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
