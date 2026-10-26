import type { RetirementPreview } from "@clc/api/features/retirement/client";
import { formatUnits } from "viem";
import { formatDateTime } from "#/lib/format";

export function BalanceSummary({ preview }: { preview: RetirementPreview }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="break-words font-medium">
        {preview.resourceType === "voucher" ? (
          <>
            Other accounts hold{" "}
            {preview.amountOutsideOwnerRaw === null
              ? "an unavailable amount"
              : formatUnits(BigInt(preview.amountOutsideOwnerRaw), preview.decimals)}{" "}
            {preview.symbol}.
          </>
        ) : (
          <>
            The pool holds {preview.positiveTokenCount ?? "an unavailable number of"} known voucher{" "}
            {preview.positiveTokenCount === 1 ? "type" : "types"} with positive balances.
          </>
        )}
      </p>
      {preview.coverageNote ? (
        <p className="text-muted-foreground">{preview.coverageNote}</p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Checked {formatDateTime(preview.checkedAt)} · Block {preview.blockNumber} · Chain{" "}
        {preview.chainId}
      </p>
    </div>
  );
}
