import { createFileRoute } from "@tanstack/react-router";

import { HomeRoutePage } from "#/components/home-route-page";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  return <HomeRoutePage activeTab="activity" />;
}
