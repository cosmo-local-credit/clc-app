import type { ReactNode } from "react";

import { Checkbox } from "#/components/ui/checkbox";
import { FieldError } from "#/components/ui/field";

export function AgreementField({
  id,
  checked,
  onCheckedChange,
  error,
  disabled,
  children,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-invalid={!!error}
          disabled={disabled}
          className="mt-0.5"
        />
        <span className="text-muted-foreground text-sm">{children}</span>
      </label>
      {error ? <FieldError error={error} /> : null}
    </div>
  );
}
