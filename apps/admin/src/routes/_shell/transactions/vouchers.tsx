import { createFileRoute } from "@tanstack/react-router";
import { parseVoucherTransactionsSearch } from "#/features/transactions/transactions-search";
import { VoucherTransactionsPage } from "#/features/transactions/voucher-transactions-page";

export const Route = createFileRoute("/_shell/transactions/vouchers")({
  validateSearch: parseVoucherTransactionsSearch,
  component: () => <VoucherTransactionsPage search={Route.useSearch()} />,
});
