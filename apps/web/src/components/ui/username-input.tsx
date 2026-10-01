import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { recipientsClient } from "#/lib/api/recipients";
import { Button } from "./button";
import { Input } from "./input";

/** Suggestions are read-only; saving the profile claims the current name. */
export function UsernameInput({
  id,
  value,
  hint,
  onChange,
  onBlur,
  invalid,
  automatic = true,
}: {
  id: string;
  value: string;
  hint: () => string;
  onChange: (value: string) => void;
  onBlur: () => void;
  invalid: boolean;
  automatic?: boolean;
}) {
  const currentValue = useRef(value);
  currentValue.current = value;
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="font-medium text-sm">{t`Username`}</label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={24}
      />
      <p className="text-muted-foreground text-xs">
        {automatic
          ? t`People can use this name to send vouchers to you. Leave blank to choose automatically.`
          : t`People can use this name to send vouchers to you. Leave blank to keep your current username.`}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          const before = currentValue.current;
          setBusy(true);
          setError(null);
          try {
            const suggestion = await recipientsClient.suggest(hint());
            if (currentValue.current === before) onChange(suggestion);
          } catch {
            setError(t`Couldn't suggest a username. Please try again.`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t`Finding a name…` : t`Suggest username`}
      </Button>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
