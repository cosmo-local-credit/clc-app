import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";

/**
 * `/transactions` is a section, not a page.
 *
 * It redirects to the voucher movements rather than rendering a chooser: that is
 * the page an operator wants nine times in ten, and the sidebar's submenu
 * already names the other two. `replace` keeps the section path out of history,
 * so Back leaves the section instead of bouncing through the redirect.
 */
export const Route = createFileRoute("/_shell/transactions/")({
  beforeLoad: () => {
    throw redirect({
      to: "/transactions/vouchers",
      search: { perPage: DEFAULT_PAGE_SIZE },
      replace: true,
    });
  },
});
