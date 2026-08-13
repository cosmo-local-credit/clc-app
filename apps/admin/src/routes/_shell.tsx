import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/layout/app-shell";
import { AuthBoundary } from "#/components/layout/auth-boundary";
import { Toaster } from "#/components/ui/sonner";

export const Route = createFileRoute("/_shell")({
  component: () => (
    <>
      <AuthBoundary>
        <AppShell />
      </AuthBoundary>
      <Toaster />
    </>
  ),
});
