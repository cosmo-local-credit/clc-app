import type { RetirementResourceType } from "@clc/api/features/retirement/client";
import { adminResourceRetirementHistoryQueryOptions } from "@clc/api/features/retirement/queries";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";
import { RetirementEvents } from "./retirement-events";
import { RetirementStatus } from "./retirement-status";

export function RetirementResourceHistory({
  type,
  address,
}: {
  type: RetirementResourceType;
  address: string;
}) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    ...adminResourceRetirementHistoryQueryOptions(clcApi.retirement, type, address),
    enabled: open,
    refetchOnWindowFocus: "always",
  });
  return (
    <details
      className="border-border bg-card border p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">Retirement history</summary>
      {open ? (
        <div className="mt-3 space-y-3">
          {history.isPending ? <p role="status">Loading history…</p> : null}
          {history.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{errorMessage(history.error)}</p>
              <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
                Retry history
              </Button>
            </div>
          ) : null}
          {history.data ? (
            <>
              {history.data.requests.length > 0 ? (
                <ul className="space-y-2">
                  {history.data.requests.map((request) => (
                    <li key={request.id} className="flex items-center gap-3 text-sm">
                      <Link
                        to="/retirement-requests/$requestId"
                        params={{ requestId: String(request.id) }}
                        className="underline underline-offset-4"
                      >
                        Request #{request.id}
                      </Link>
                      <RetirementStatus status={request.status} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <RetirementEvents events={history.data.events} />
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
