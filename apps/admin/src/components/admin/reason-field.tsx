import { MAX_ACCOUNT_REASON_LENGTH } from "@clc/core/features/account-retirement/logic";

import { Textarea } from "#/components/ui/textarea";

/**
 * The optional reason on a ban, an unban or a retirement.
 *
 * clc-core keeps it in the history and stops at 2000 characters, so the field
 * counts down to the same limit rather than letting the request fail.
 */
export function ReasonField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          Reason <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <span className="font-data text-muted-foreground text-xs">
          {value.length}/{MAX_ACCOUNT_REASON_LENGTH}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_ACCOUNT_REASON_LENGTH}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
