import { createFileRoute } from "@tanstack/react-router";
import { VouchersPage } from "#/features/vouchers/vouchers-page";
import { parseVoucherListSearch } from "#/features/vouchers/voucher-list-search";

export const Route = createFileRoute("/_shell/vouchers/")({
  validateSearch: parseVoucherListSearch,
  component: () => <VouchersPage search={Route.useSearch()} />,
});
