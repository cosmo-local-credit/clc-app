import type {
  RetirementRequest,
  RetirementRequestStatus,
} from "@clc/api/features/retirement/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { useCancelRetirementRequest } from "#/features/retirement/hooks/use-retirement-mutations";

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

export function RetirementRequestList({
  requests,
  viewer,
}: {
  requests: readonly RetirementRequest[];
  viewer: string;
}) {
  const { i18n } = useLingui();
  const cancel = useCancelRetirementRequest();
  return (
    <div className="space-y-3">
      {cancel.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {cancel.error.message}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {requests.map((request) => (
          <li key={request.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="font-semibold text-sm">
                {request.resourceName} ({request.symbol})
              </span>
              <time dateTime={request.requestedAt} className="text-xs text-muted-foreground">
                {i18n.date(request.requestedAt)}
              </time>
            </div>
            <p className="text-sm">
              <RequestStatus status={request.status} />
            </p>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {request.reason}
            </p>
            {request.decisionReason ? (
              <p className="whitespace-pre-wrap break-words text-sm">
                <Trans>Admin response:</Trans> {request.decisionReason}
              </p>
            ) : null}
            {request.status === "pending" &&
            request.requesterAddress.toLowerCase() === viewer.toLowerCase() ? (
              <Button
                type="button"
                variant="outline"
                tap
                disabled={cancel.isPending}
                pending={cancel.isPending && cancel.variables === request.id}
                onClick={() => cancel.mutate(request.id)}
              >
                <Trans>Cancel request</Trans>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
