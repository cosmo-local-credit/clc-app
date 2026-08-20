import { createFileRoute } from "@tanstack/react-router";
import { PoolPublishPage } from "#/features/pools/pool-publish-page";

export const Route = createFileRoute("/_shell/pools/publish")({
  component: PoolPublishPage,
});
