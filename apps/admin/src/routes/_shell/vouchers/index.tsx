import { createFileRoute } from "@tanstack/react-router";
import { VouchersPage } from "#/features/vouchers/vouchers-page";
import { parseTableSearch } from "#/lib/table-search";

export const Route = createFileRoute("/_shell/vouchers/")({
  validateSearch: parseTableSearch,
  component: () => <VouchersPage search={Route.useSearch()} />,
});
