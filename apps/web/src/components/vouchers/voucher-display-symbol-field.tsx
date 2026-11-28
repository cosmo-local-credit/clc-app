import { takenSymbolsQueryOptions } from "@clc/api/features/symbols/queries";
import { parseVoucherDisplaySymbol } from "@clc/core/lib/symbol";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { symbolsClient } from "#/lib/api/symbols";

export function VoucherDisplaySymbolField({
  value,
  initial,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  value: string;
  initial: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useLingui();
  const id = useId();
  const [checked, setChecked] = useState<string | null>(null);
  const candidate = parseVoucherDisplaySymbol(value);
  const shouldCheck =
    candidate !== null && candidate === checked && candidate !== parseVoucherDisplaySymbol(initial);
  const query = useQuery({
    ...takenSymbolsQueryOptions(symbolsClient, "voucher", candidate ?? "", "display"),
    enabled: shouldCheck,
  });
  const taken = shouldCheck && query.data?.taken.includes(candidate);
  const fieldError = error ?? (taken ? t`That symbol is already in use.` : undefined);

  return (
    <Field label={t`Symbol`} htmlFor={id} hint={t`Use 3–6 letters or digits.`} error={fieldError}>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(fieldError)}
        autoCapitalize="characters"
        spellCheck={false}
        dir="ltr"
        className="font-mono"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          setChecked(candidate);
          onBlur();
        }}
      />
    </Field>
  );
}
