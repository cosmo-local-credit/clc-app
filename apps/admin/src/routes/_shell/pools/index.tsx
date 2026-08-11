import { createFileRoute } from "@tanstack/react-router";
import { PoolsPage } from "#/features/pools/pools-page";

export const Route = createFileRoute("/_shell/pools/")({
  component: PoolsPage,
});
