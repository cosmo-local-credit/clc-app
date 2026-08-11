import type { ReactNode } from "react";
import { LoadingBlock } from "#/components/admin/loading-block";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { useAdminSession } from "#/features/auth/admin-session";

/**
 * Gate for every admin surface.
 *
 * The session itself is stubbed (see features/auth/admin-session.ts) — this
 * boundary is the seam that stays put once a real one exists, so no surface
 * needs to change. AppShell shows a standing banner while the session is a stub:
 * an unauthenticated console that silently looks authenticated is the failure
 * mode worth preventing.
 */
export function AuthBoundary({ children }: { children: ReactNode }) {
  const session = useAdminSession();

  if (session.status === "loading") {
    return (
      <div className="p-6">
        <LoadingBlock rows={6} />
      </div>
    );
  }

  if (session.status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-start justify-center p-6">
        <Alert className="max-w-lg">
          <AlertTitle>Sign-in required</AlertTitle>
          <AlertDescription>
            This console needs an operator session. No sign-in mechanism is wired up yet.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // The stub banner is rendered by AppShell inside SidebarInset, not here — the
  // sidebar is fixed-positioned, so a banner at this level would sit behind it.
  return <>{children}</>;
}
