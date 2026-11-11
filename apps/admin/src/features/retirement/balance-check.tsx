import type { RetirementPreview } from "@clc/api/features/retirement/client";
import type { UseQueryResult } from "@tanstack/react-query";
import { Checkbox } from "#/components/ui/checkbox";
import { errorMessage } from "#/lib/data-state";
import { BalanceSummary } from "./balance-summary";

/**
 * The balance preview as the retirement screens show it: checking, failed, or the
 * summary. The decision form and the direct retirement sheet share it, so both
 * read the same words about the same check.
 */
export function BalanceCheck({ preview }: { preview: UseQueryResult<RetirementPreview> }) {
  if (preview.isPending) {
    return (
      <p role="status" className="text-sm">
        Checking current balances…
      </p>
    );
  }
  if (preview.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        Could not check balances. {errorMessage(preview.error)}
      </p>
    );
  }
  return preview.data ? <BalanceSummary preview={preview.data} /> : null;
}

/**
 * The acknowledgement is tied to the block the balances were read at, so a
 * refreshed check clears it and the operator confirms what they are now looking at.
 */
export function BalanceAcknowledgement({
  current,
  acknowledgedBlock,
  disabled,
  label,
  onChange,
}: {
  current: RetirementPreview;
  acknowledgedBlock: string | null;
  disabled: boolean;
  label: string;
  onChange: (block: string | null) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm" htmlFor="acknowledge-balances">
      <Checkbox
        id="acknowledge-balances"
        checked={acknowledgedBlock === current.blockNumber}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked ? current.blockNumber : null)}
      />
      <span>{label}</span>
    </label>
  );
}
