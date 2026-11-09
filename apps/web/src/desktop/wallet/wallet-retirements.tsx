import { myRetirementRequestsQueryOptions } from "@clc/api/features/retirement/queries";
import type {
  RetirementRequest,
  RetirementRequestStatus,
} from "@clc/api/features/retirement/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { Button } from "#/components/ui/button";
import { DeskRowList, DeskSection } from "#/desktop/ui/page";
import { ErrorRetry } from "#/desktop/wallet/wallet-parts";
import { useCancelRetirementRequest } from "#/features/retirement/hooks/use-retirement-mutations";
import { retirementClient } from "#/lib/api/retirement";

function RequestStatus({ status }: { status: RetirementRequestStatus }) {
  switch (status) {
    case "pending":
      return <Trans>Awaiting admin review</Trans>;
    case "approved":
      return <Trans>Retirement approved</Trans>;
    case "rejected":
      return <Trans>Request rejected</Trans>;
    case "cancelled":
      return <Trans>Request cancelled</Trans>;
    case "invalidated":
      return <Trans>Request closed because ownership changed</Trans>;
  }
}

/**
 * Retirement requests the account has made, kept reachable from the Wallet
 * because a retired voucher or pool may no longer have a public page. Hidden
 * until there is history to show (or a failure to recover from); only the
 * requester can cancel, and only while the request is pending.
 */
export function WalletRetirements({ viewer }: { viewer: string }) {
  const { i18n } = useLingui();
  const history = useQuery(myRetirementRequestsQueryOptions(retirementClient, viewer));
  const cancel = useCancelRetirementRequest();
  if (history.isPending || (!history.isError && history.data.length === 0)) return null;

  return (
    <DeskSection title={<Trans>Retirement requests</Trans>}>
      {history.isError ? (
        <ErrorRetry
          message={<Trans>Could not load retirement requests.</Trans>}
          pending={history.isFetching}
          onRetry={() => void history.refetch()}
        />
      ) : (
        <div className="grid min-w-0 gap-2">
          {cancel.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {cancel.error.message}
            </p>
          ) : null}
          <DeskRowList>
            {history.data.map((request: RetirementRequest) => (
              <div key={request.id} className="grid min-w-0 gap-1.5 px-3.5 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
                    <span dir="auto">{request.resourceName}</span> (
                    <span className="font-mono" dir="ltr">
                      {request.symbol}
                    </span>
                    )
                  </span>
                  <time
                    dateTime={request.requestedAt}
                    className="shrink-0 font-mono text-xs text-muted-foreground"
                  >
                    {i18n.date(request.requestedAt)}
                  </time>
                </div>
                <p className="text-sm">
                  <RequestStatus status={request.status} />
                </p>
                <p
                  dir="auto"
                  className="text-xs whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]"
                >
                  {request.reason}
                </p>
                {request.decisionReason ? (
                  <p dir="auto" className="text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                    <Trans>Admin response:</Trans> {request.decisionReason}
                  </p>
                ) : null}
                {request.status === "pending" &&
                request.requesterAddress.toLowerCase() === viewer.toLowerCase() ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    disabled={cancel.isPending}
                    pending={cancel.isPending && cancel.variables === request.id}
                    onClick={() => cancel.mutate(request.id)}
                  >
                    <Trans>Cancel request</Trans>
                  </Button>
                ) : null}
              </div>
            ))}
          </DeskRowList>
        </div>
      )}
    </DeskSection>
  );
}
