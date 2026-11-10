import { Link } from "@tanstack/react-router";
import { HiOutlineBell } from "react-icons/hi";
import { SidebarCount } from "#/components/admin/sidebar-count";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { usePendingRetirementCount } from "./use-retirement";

/** Count of pending retirement requests, as the sidebar status counter. */
export function RetirementPendingBadge() {
  const count = usePendingRetirementCount();
  return (
    <SidebarCount
      count={count.isError ? undefined : count.data}
      label="pending retirement requests"
      title="Pending retirement requests"
    />
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
