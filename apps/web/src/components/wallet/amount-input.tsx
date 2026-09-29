import type * as React from "react";

import { Input } from "#/components/ui/input";

type WalletAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "aria-label" | "className" | "defaultValue" | "onChange" | "value"
> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};

function WalletAmountInput({
  label,
  value,
  onValueChange,
  type = "text",
  inputMode = "decimal",
  placeholder = "0.00",
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
      className="truncate px-2 text-end font-heading text-[1.375rem] font-semibold leading-none tracking-tight"
    />
  );
}

export { WalletAmountInput };
