import { myRetirementRequestsQueryOptions } from "@clc/api/features/retirement/queries";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { retirementClient } from "#/lib/api/retirement";
import { RetirementRequestList } from "./retirement-request-list";

/** Accessible from the wallet even when a retired voucher's public page is hidden. */
export function MyRetirementRequests({ viewer }: { viewer: string }) {
  const history = useQuery(myRetirementRequestsQueryOptions(retirementClient, viewer));
  if (history.isPending || (!history.isError && history.data.length === 0)) return null;
  return (
    <details className="border border-border bg-card p-3">
      <summary className="cursor-pointer font-semibold text-sm">
        <Trans>Retirement requests</Trans>
      </summary>
      <div className="pt-3">
        {history.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm">
              <Trans>Could not load retirement requests.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={history.isFetching}
              onClick={() => void history.refetch()}
            >
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : (
          <RetirementRequestList requests={history.data} viewer={viewer} />
        )}
      </div>
    </details>
  );
}
