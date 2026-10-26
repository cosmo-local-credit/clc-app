import { createFileRoute } from "@tanstack/react-router";
import { PoolsPage } from "#/features/pools/pools-page";
import { parsePoolListSearch } from "#/features/pools/pool-list-search";

export const Route = createFileRoute("/_shell/pools/")({
  validateSearch: parsePoolListSearch,
  component: () => <PoolsPage search={Route.useSearch()} />,
});
