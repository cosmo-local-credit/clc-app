import { createFileRoute, redirect } from "@tanstack/react-router";

// Someone here truncated a voucher link; the list view is the browsable catalogue.
export const Route = createFileRoute("/vouchers/")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { tab: "market", view: "list" }, replace: true });
  },
});
