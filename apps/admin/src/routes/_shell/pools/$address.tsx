import { createFileRoute } from "@tanstack/react-router";
import { PoolDetailPage } from "#/features/pools/pool-detail-page";
import { parsePoolDetailSearch } from "#/features/pools/pool-detail-search";

export const Route = createFileRoute("/_shell/pools/$address")({
  validateSearch: parsePoolDetailSearch,
  component: () => (
    <PoolDetailPage address={Route.useParams().address} search={Route.useSearch()} />
  ),
});
