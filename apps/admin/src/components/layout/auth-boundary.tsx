import type { ReactNode } from "react";
import { LoadingBlock } from "#/components/admin/loading-block";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { type AdminSession, useAdminSession } from "#/features/auth/admin-session";

/**
 * Gate for every admin surface.
 *
 * The session itself is stubbed (see features/auth/admin-session.ts) — this
 * boundary is the seam that stays put once a real one exists, so no surface
 * needs to change. AppShell shows a standing banner while the session is a stub:
 * an unauthenticated console that silently looks authenticated is the failure
 * mode worth preventing.
 *
 * This is a UX gate only. The backend is the security authority and must enforce
 * the required permission on every admin endpoint regardless of what renders here.
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

  // The stub banner is rendered by AppShell inside SidebarInset, not here — the
  // sidebar is fixed-positioned, so a banner at this level would sit behind it.
  if (session.status === "authenticated") return <>{children}</>;

  const { title, description } = blockedCopy(session);

  return (
    <div className="flex min-h-screen items-start justify-center p-6">
      <Alert className="max-w-lg">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Copy for every state that withholds the console. Exhaustive over the union, so
 * a new session state added later fails to compile until it is handled here.
 */
function blockedCopy(
  session: Exclude<AdminSession, { status: "loading" } | { status: "authenticated" }>,
): { title: string; description: string } {
  switch (session.status) {
    case "unauthenticated":
      return {
        title: "Sign-in required",
        description:
          "This console needs an operator session. No sign-in mechanism is wired up yet.",
      };
    case "unauthorized":
      return {
        title: "Not authorized",
        description:
          `Signed in as ${session.operator.name}, but this account does not have console access. ` +
          "Ask a steward to grant it — signing in again will not help.",
      };
    case "unavailable":
      return {
        title: "Could not verify your session",
        description: `${session.message} The console stays locked until the check succeeds.`,
      };
  }
}
