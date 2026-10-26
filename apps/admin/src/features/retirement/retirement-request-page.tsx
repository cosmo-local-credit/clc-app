import { adminRetirementRequestQueryOptions } from "@clc/api/features/retirement/queries";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppBreadcrumb } from "#/components/admin/app-breadcrumb";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { BalanceSummary } from "./balance-summary";
import { RetirementDecisionForm } from "./retirement-decision-form";
import { RetirementEvents } from "./retirement-events";
import { RetirementStatus } from "./retirement-status";

export function RetirementRequestPage({ requestId }: { requestId: string }) {
  const id = Number(requestId);
  const query = useQuery({
    ...adminRetirementRequestQueryOptions(clcApi.retirement, id),
    refetchOnWindowFocus: "always",
  });
  if (!Number.isSafeInteger(id) || id <= 0)
    return (
      <PageState
        title="Invalid retirement request"
        message="The request ID must be a positive integer."
      />
    );
  if (query.isPending) return <LoadingBlock rows={6} />;
  if (!query.data || query.isError)
    return (
      <div className="space-y-3">
        <PageState title="Could not load retirement request" message={errorMessage(query.error)} />
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  const { request, events } = query.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Retirement request #${request.id}`}
        breadcrumbs={
          <AppBreadcrumb
            items={[
              { label: "Retirement requests", to: "/retirement-requests" },
              { label: `#${request.id}` },
            ]}
          />
        }
        actions={<RetirementStatus status={request.status} />}
      />
      <section
        className="border-border bg-card space-y-4 border p-4"
        aria-labelledby="request-heading"
      >
        <h2 id="request-heading" className="font-medium">
          {request.resourceType === "voucher" ? (
            <Link
              to="/vouchers/$address"
              params={{ address: request.resourceAddress }}
              search={{ tab: "offerings" }}
              className="underline underline-offset-4"
            >
              {request.resourceName || request.symbol || request.resourceAddress}
            </Link>
          ) : (
            <Link
              to="/pools/$address"
              params={{ address: request.resourceAddress }}
              search={{ tab: "vouchers" }}
              className="underline underline-offset-4"
            >
              {request.resourceName || request.symbol || request.resourceAddress}
            </Link>
          )}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Resource</dt>
            <dd className="capitalize">
              {request.resourceType} · Chain {request.chainId}
            </dd>
            <dd className="font-data break-all text-xs">{request.resourceAddress}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Requested</dt>
            <dd>{formatDateTime(request.requestedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Requester</dt>
            <dd className="font-data break-all text-xs">{request.requesterAddress}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owner at request</dt>
            <dd className="font-data break-all text-xs">{request.ownerAddress}</dd>
          </div>
        </dl>
        <div>
          <h3 className="text-muted-foreground text-sm">Reason for retirement</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{request.reason}</p>
        </div>
        <div className="border-border border-t pt-3">
          <h3 className="mb-2 text-sm font-medium">Balances when requested</h3>
          <BalanceSummary preview={request.snapshot} />
        </div>
      </section>
      {request.status === "pending" ? (
        <RetirementDecisionForm key={request.id} request={request} />
      ) : (
        <section
          className="border-border bg-card space-y-3 border p-4"
          aria-labelledby="outcome-heading"
        >
          <h2 id="outcome-heading" className="font-medium">
            Request outcome
          </h2>
          <p className="text-sm capitalize">
            {request.status} · {formatDateTime(request.decisionAt)}
          </p>
          {request.decisionBy ? (
            <p className="font-data text-muted-foreground break-all text-xs">
              {request.decisionBy}
            </p>
          ) : null}
          {request.decisionReason ? (
            <p className="whitespace-pre-wrap break-words text-sm">{request.decisionReason}</p>
          ) : null}
          {request.decisionSnapshot ? <BalanceSummary preview={request.decisionSnapshot} /> : null}
        </section>
      )}
      <section className="border-border bg-card border p-4" aria-labelledby="history-heading">
        <h2 id="history-heading" className="font-medium">
          Decision and restoration history
        </h2>
        <RetirementEvents events={events} />
      </section>
    </div>
  );
}
