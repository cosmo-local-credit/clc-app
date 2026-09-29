import type * as React from "react";

import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

/**
 * Where the amount sits in a screen's hierarchy. Left unset it is the standard
 * wallet amount; `primary` is the one figure a screen is about, `secondary` the
 * one that follows from it. Only the type size changes: the outlined white
 * surface and the input's standard height are the same throughout.
 */
type WalletAmountEmphasis = "primary" | "secondary";

const EMPHASIS_CLASS: Record<WalletAmountEmphasis | "default", string> = {
  primary: "text-[1.5rem]",
  secondary: "text-[1rem]",
  default: "text-[1.375rem]",
};

type WalletAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "aria-label" | "className" | "defaultValue" | "onChange" | "value"
> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  emphasis?: WalletAmountEmphasis;
};

function WalletAmountInput({
  label,
  value,
  onValueChange,
  type = "text",
  inputMode = "decimal",
  placeholder = "0.00",
  emphasis,
  ...props
}: WalletAmountInputProps) {
  return (
    <Input
      {...props}
      dir="ltr"
      type={type}
      inputMode={inputMode}
      placeholder={placeholder}
      aria-label={label}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(
        "truncate px-2 text-end font-heading font-semibold leading-none tracking-tight",
        EMPHASIS_CLASS[emphasis ?? "default"],
      )}
    />
  );
}

export { WalletAmountInput };
