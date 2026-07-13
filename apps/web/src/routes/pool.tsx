import { createFileRoute } from "@tanstack/react-router";

import { HomeRoutePage } from "#/components/home-route-page";

export const Route = createFileRoute("/pool")({
  component: PoolPage,
});

function PoolPage() {
  return <HomeRoutePage activeTab="pool" />;
}
