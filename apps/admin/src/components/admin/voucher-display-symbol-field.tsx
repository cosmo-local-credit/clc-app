import { takenSymbolsQueryOptions } from "@clc/api/features/symbols/queries";
import { parseVoucherDisplaySymbol } from "@clc/core/lib/symbol";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { clcApi } from "#/lib/api";

export function VoucherDisplaySymbolField({
  value,
  initial,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  value: string;
  initial?: string | null;
  error?: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const id = useId();
  const [checked, setChecked] = useState<string | null>(null);
  const candidate = parseVoucherDisplaySymbol(value);
  const query = useQuery({
    ...takenSymbolsQueryOptions(clcApi.symbols, "voucher", candidate ?? "", "display"),
    enabled: candidate !== null && candidate !== initial && candidate === checked,
  });
  const taken =
    candidate !== null &&
    candidate !== initial &&
    candidate === checked &&
    query.data?.taken.includes(candidate);
  const fieldError = error ?? (taken ? "That symbol is already in use." : undefined);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Symbol</Label>
      <Input
        id={id}
        value={value}
        className="font-mono"
        dir="ltr"
        spellCheck={false}
        autoCapitalize="characters"
        aria-invalid={Boolean(fieldError)}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          setChecked(candidate);
          onBlur?.();
        }}
      />
      {fieldError ? (
        <p id={`${id}-help`} role="alert" className="text-destructive text-xs">
          {fieldError}
        </p>
      ) : (
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          Use 3–6 letters or digits.
        </p>
      )}
    </div>
  );
}
