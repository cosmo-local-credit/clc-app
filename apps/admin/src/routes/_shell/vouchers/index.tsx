import { createFileRoute } from "@tanstack/react-router";
import { VouchersPage } from "#/features/vouchers/vouchers-page";
import { parseVouchersSearch } from "#/features/vouchers/vouchers-search";

export const Route = createFileRoute("/_shell/vouchers/")({
  validateSearch: parseVouchersSearch,
  component: () => <VouchersPage search={Route.useSearch()} />,
});
