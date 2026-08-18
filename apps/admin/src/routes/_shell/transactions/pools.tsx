import { createFileRoute } from "@tanstack/react-router";
import { PoolTransactionsPage } from "#/features/transactions/pool-transactions-page";
import { parsePoolTransactionsSearch } from "#/features/transactions/transactions-search";

export const Route = createFileRoute("/_shell/transactions/pools")({
  validateSearch: parsePoolTransactionsSearch,
  component: () => <PoolTransactionsPage search={Route.useSearch()} />,
});
