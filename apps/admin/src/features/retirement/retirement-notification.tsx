import { Link } from "@tanstack/react-router";
import { HiOutlineBell } from "react-icons/hi";
import { Badge } from "#/components/ui/badge";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { usePendingRetirementCount } from "./use-retirement";

/**
 * Count of pending retirement requests, drawn as the sidebar status counter:
 * in the row, after the label, and absent when nothing is waiting.
 */
export function RetirementPendingBadge() {
  const count = usePendingRetirementCount();
  if (count.data === undefined || count.isError || count.data < 1) return null;
  return (
    <Badge
      variant="destructive"
      aria-label={`${count.data} pending retirement requests`}
      title="Pending retirement requests"
      className="ml-auto h-5 min-w-5 justify-center px-1 font-mono group-data-[collapsible=icon]:hidden"
    >
      {count.data}
    </Badge>
  );
}

export function RetirementDashboardLink() {
  const count = usePendingRetirementCount();
  const available = count.data !== undefined && !count.isError;
  return (
    <Link
      to="/retirement-requests"
      search={{ perPage: DEFAULT_PAGE_SIZE }}
      className="border-border bg-card hover:bg-accent/60 focus-visible:ring-ring flex flex-wrap items-center gap-3 border p-4 outline-none focus-visible:ring-1"
    >
      <HiOutlineBell aria-hidden="true" className="size-5 shrink-0" />
      <span className="font-medium">Retirement requests</span>
      <span className="text-muted-foreground text-sm">
        {available ? `${count.data} awaiting review` : "Pending count unavailable"}
      </span>
      <span className="ml-auto text-sm underline underline-offset-4">Open queue</span>
    </Link>
  );
}
