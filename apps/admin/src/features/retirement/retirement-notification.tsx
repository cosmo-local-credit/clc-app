import { Link } from "@tanstack/react-router";
import { HiOutlineBell } from "react-icons/hi";
import { SidebarMenuBadge } from "#/components/ui/sidebar";
import { usePendingRetirementCount } from "./use-retirement";

export function RetirementPendingBadge() {
  const count = usePendingRetirementCount();
  const available = count.data !== undefined && !count.isError;
  return (
    <SidebarMenuBadge
      aria-label={
        available
          ? `${count.data} pending retirement requests`
          : "Pending retirement count unavailable"
      }
      title={available ? "Pending retirement requests" : "Pending count unavailable"}
    >
      {available ? count.data : "—"}
    </SidebarMenuBadge>
  );
}

export function RetirementDashboardLink() {
  const count = usePendingRetirementCount();
  const available = count.data !== undefined && !count.isError;
  return (
    <Link
      to="/retirement-requests"
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
