import { Outlet, createFileRoute } from "@tanstack/react-router";

import { NavigationShell } from "#/components/navigation/navigation-shell";
import { useLayout } from "#/desktop/layout";

function NavLayout() {
  const layout = useLayout();
  if (layout === "desktop") return <Outlet />;
  return <NavigationShell />;
}

export const Route = createFileRoute("/_nav")({
  component: NavLayout,
});
