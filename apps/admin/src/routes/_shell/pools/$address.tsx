import { createFileRoute } from "@tanstack/react-router";
import { PoolDetailPage } from "#/features/pools/pool-detail-page";

export const Route = createFileRoute("/_shell/pools/$address")({
  component: () => <PoolDetailPage address={Route.useParams().address} />,
});
