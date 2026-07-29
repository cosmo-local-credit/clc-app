import { createFileRoute } from "@tanstack/react-router";

import { NavigationShell } from "#/components/navigation/navigation-shell";

export const Route = createFileRoute("/_nav")({
  component: NavigationShell,
});
