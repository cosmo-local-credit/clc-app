import { createFileRoute } from "@tanstack/react-router";

import { HomeRoutePage } from "#/components/home-route-page";

export const Route = createFileRoute("/market")({
  component: MarketRoutePage,
});

function MarketRoutePage() {
  return <HomeRoutePage activeTab="market" />;
}
