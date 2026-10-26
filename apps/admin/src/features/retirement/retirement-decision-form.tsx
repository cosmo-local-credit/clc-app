import type { RetirementRequest } from "@clc/api/features/retirement/client";
import { retirementPreviewQueryOptions } from "@clc/api/features/retirement/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Textarea } from "#/components/ui/textarea";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { BalanceSummary } from "./balance-summary";
import { useRetirementInvalidation } from "./use-retirement";

export function RetirementDecisionForm({ request }: { request: RetirementRequest }) {
  const [reason, setReason] = useState("");
  const [acknowledgedBlock, setAcknowledgedBlock] = useState<string | null>(null);
  const invalidate = useRetirementInvalidation();
  const preview = useQuery({
    ...retirementPreviewQueryOptions(
      clcApi.retirement,
      request.resourceType,
      request.resourceAddress,
      "admin",
    ),
    refetchOnWindowFocus: "always",
  });
  const decision = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      action === "approve"
        ? clcApi.retirement.approve(request.id, {
            acknowledgeBalances: acknowledgedBlock === preview.data?.blockNumber,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          })
        : clcApi.retirement.reject(request.id, { reason: reason.trim() }),
    onSuccess: invalidate,
    onError: () => {
      setAcknowledgedBlock(null);
      void invalidate();
    },
  });
  const current = preview.data;
  const ownerChanged =
    current && current.ownerAddress.toLowerCase() !== request.ownerAddress.toLowerCase();
  const canApprove =
    current &&
    !preview.isError &&
    !preview.isFetching &&
    current.active &&
    !ownerChanged &&
    (!current.hasPositiveBalances || acknowledgedBlock === current.blockNumber);

  return (
    <section
      className="border-border bg-card space-y-4 border p-4"
      aria-labelledby="decision-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="decision-heading" className="font-medium">
          Admin decision
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={preview.isFetching || decision.isPending}
          onClick={() => {
            setAcknowledgedBlock(null);
            void preview.refetch();
          }}
        >
          Refresh balances
        </Button>
      </div>
      {preview.isPending ? (
        <p role="status" className="text-sm">
          Checking current balances…
        </p>
      ) : null}
      {preview.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Could not check balances. {errorMessage(preview.error)}
        </p>
      ) : current ? (
        <BalanceSummary preview={current} />
      ) : null}
      {ownerChanged ? (
        <p role="alert" className="text-destructive text-sm">
          Ownership has changed. This request cannot be approved. The current owner must submit a
          new request.
        </p>
      ) : null}
      {current && !current.active ? (
        <p role="alert" className="text-sm">
          This resource is already retired. Refresh the request to see its latest status.
        </p>
      ) : null}
      {current?.hasPositiveBalances ? (
        <label className="flex items-start gap-3 text-sm" htmlFor="acknowledge-balances">
          <Checkbox
            id="acknowledge-balances"
            checked={acknowledgedBlock === current.blockNumber}
            disabled={decision.isPending || preview.isFetching || preview.isError}
            onCheckedChange={(checked) =>
              setAcknowledgedBlock(checked ? current.blockNumber : null)
            }
          />
          <span>I understand that balances remain and approve retirement with these balances.</span>
        </label>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Retirement does not delete the blockchain contract, balances or transaction history.
        {request.resourceType === "pool"
          ? " Owner withdrawals remain available."
          : " The voucher will be hidden from CLC discovery, wallet lists and Send."}
      </p>
      <div className="space-y-2">
        <label htmlFor="decision-reason" className="text-sm font-medium">
          Decision explanation{" "}
          <span className="text-muted-foreground font-normal">(required to reject)</span>
        </label>
        <Textarea
          id="decision-reason"
          maxLength={2000}
          value={reason}
          disabled={decision.isPending}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {decision.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(decision.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canApprove || decision.isPending}
          onClick={() => decision.mutate("approve")}
        >
          {decision.isPending && decision.variables === "approve"
            ? "Approving…"
            : "Approve retirement"}
        </Button>
        <Button
          variant="outline"
          disabled={!reason.trim() || decision.isPending}
          onClick={() => decision.mutate("reject")}
        >
          {decision.isPending && decision.variables === "reject" ? "Rejecting…" : "Reject request"}
        </Button>
      </div>
    </section>
  );
}
