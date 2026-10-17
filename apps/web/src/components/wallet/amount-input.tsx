import type * as React from "react";

import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

type WalletAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "aria-label" | "className" | "defaultValue" | "onChange" | "value"
> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /**
   * The amount a screen wants filled in, where it has more than one: outlined in
   * the brand colour instead of the neutral border, focused or not. Size and type
   * stay the same, so two amounts on one screen still read as a pair.
   */
  highlighted?: boolean;
};

function WalletAmountInput({
  label,
  value,
  onValueChange,
  type = "text",
  inputMode = "decimal",
  placeholder = "0.00",
  highlighted = false,
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
        "truncate px-2 text-end text-xl font-semibold leading-none tabular-nums",
        highlighted && "border-primary focus-visible:border-primary",
      )}
    />
  );
}

export { WalletAmountInput };
