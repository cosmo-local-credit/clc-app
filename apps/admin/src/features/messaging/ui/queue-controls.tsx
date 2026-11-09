import { Button } from "#/components/ui/button";

const selectClass = "border-input bg-card h-9 border px-2 text-sm focus-visible:outline-ring";

export function QueueStatusFilter<Status extends string>({
  id,
  value,
  statuses,
  onChange,
}: {
  id: string;
  value: Status;
  statuses: readonly Status[];
  onChange: (status: Status) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs" htmlFor={id}>
      Status
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => {
          const next = statuses.find((status) => status === event.target.value);
          if (next) onChange(next);
        }}
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status[0]?.toUpperCase()}
            {status.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The queue's pager. clc-core's cursors are opaque and only run forward, so a
 * queue pages by appending rather than by numbered pages.
 */
export function QueueFooter({
  count,
  noun,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  count: number;
  noun: [singular: string, plural: string];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-data text-muted-foreground text-xs">
        {count} {count === 1 ? noun[0] : noun[1]}
        {hasNextPage ? " loaded" : ""}
      </span>
      {hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isFetchingNextPage}
          aria-busy={isFetchingNextPage || undefined}
          onClick={onLoadMore}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
