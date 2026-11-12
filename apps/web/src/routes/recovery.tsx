import { createFileRoute } from "@tanstack/react-router";

import { RecoveryPage } from "#/components/account-retirement/recovery-page";
import { useLayout } from "#/desktop/layout";

// Outside the tab shell on purpose: a retiring account has no tabs. The root's
// lifecycle gate sends it here from every route it may not open.
export const Route = createFileRoute("/recovery")({
  component: RecoveryRoute,
});

function RecoveryRoute() {
  return <RecoveryPage column={useLayout() === "desktop"} />;
}
