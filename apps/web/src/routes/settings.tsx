import { createFileRoute } from "@tanstack/react-router";

import { HomeRoutePage } from "#/components/home-route-page";

export const Route = createFileRoute("/settings")({
  component: SettingsRoutePage,
});

function SettingsRoutePage() {
  return <HomeRoutePage activeTab="settings" />;
}
