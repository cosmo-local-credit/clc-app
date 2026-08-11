import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/layout/app-shell";
import { AuthBoundary } from "#/components/layout/auth-boundary";

export const Route = createFileRoute("/_shell")({
  component: () => (
    <AuthBoundary>
      <AppShell />
    </AuthBoundary>
  ),
});
