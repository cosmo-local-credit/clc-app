import type { RetirementEvent } from "@clc/api/features/retirement/client";
import { formatDateTime } from "#/lib/format";

export function RetirementEvents({ events }: { events: RetirementEvent[] }) {
  if (events.length === 0)
    return <p className="text-muted-foreground text-sm">No retirement or restoration history.</p>;
  return (
    <ol className="divide-border divide-y">
      {events.map((event) => (
        <li key={event.id} className="space-y-1 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium capitalize">{event.action}</span>
            <time className="text-muted-foreground text-xs" dateTime={event.createdAt}>
              {formatDateTime(event.createdAt)}
            </time>
          </div>
          <p className="font-data text-muted-foreground break-all text-xs">{event.actorAddress}</p>
          {event.reason ? <p className="whitespace-pre-wrap break-words">{event.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
