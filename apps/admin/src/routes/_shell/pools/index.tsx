import { createFileRoute } from "@tanstack/react-router";
import { PoolsPage } from "#/features/pools/pools-page";
import { parseTableSearch } from "#/lib/table-search";

export const Route = createFileRoute("/_shell/pools/")({
  validateSearch: parseTableSearch,
  component: () => <PoolsPage search={Route.useSearch()} />,
});
