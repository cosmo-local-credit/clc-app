import { lazy, type ReactNode, Suspense } from "react";
import { LoadingBlock } from "#/components/admin/loading-block";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  type AdminSession,
  SUPERADMIN_ROLE,
  useAdminSession,
  useAdminSignOut,
} from "#/features/auth/admin-session";

/**
 * Gate for every admin surface.
 *
 * Signing in pulls in viem and the BIP38 implementation, neither of which an
 * already-authenticated operator needs, so the panel is a separate chunk.
 */
const SignInPanel = lazy(() =>
  import("#/features/auth/ui/sign-in-panel").then((module) => ({ default: module.SignInPanel })),
);

/**
 * This is a UX gate only. clc-core enforces `requireSuperAdmin` on every admin
 * endpoint and remains the security authority, regardless of what renders here.
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

  if (session.status === "authenticated") return <>{children}</>;

  if (session.status === "unauthenticated") {
    return (
      <Suspense
        fallback={
          <div className="p-6">
            <LoadingBlock rows={4} />
          </div>
        }
      >
        <SignInPanel />
      </Suspense>
    );
  }

  return <BlockedScreen session={session} />;
}

/**
 * The states that withhold the console from someone who already has a session.
 *
 * Both offer sign-out: an operator who signed in with the wrong account, or
 * against a backend that cannot report their role, would otherwise have no way
 * back to the sign-in panel.
 */
function BlockedScreen({
  session,
}: {
  session: Extract<AdminSession, { status: "unauthorized" } | { status: "unavailable" }>;
}) {
  const signOut = useAdminSignOut();
  const { title, description } = blockedCopy(session);

  return (
    <div className="flex min-h-screen items-start justify-center p-6">
      <Alert className="max-w-lg">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{description}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            {signOut.isPending ? "Signing out..." : "Sign out"}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

/** Exhaustive over the blocked states, so a new one fails to compile until handled. */
function blockedCopy(
  session: Extract<AdminSession, { status: "unauthorized" } | { status: "unavailable" }>,
): { title: string; description: string } {
  switch (session.status) {
    case "unauthorized":
      return {
        title: "Not authorized",
        description:
          `Signed in as ${session.operator.address} with the role ${session.operator.role}. ` +
          `This console requires ${SUPERADMIN_ROLE}. Ask a superadmin to change the role on this ` +
          "account — signing in again will not help.",
      };
    case "unavailable":
      return {
        title: "Could not verify your session",
        description: `${session.message} The console stays locked until the check succeeds.`,
      };
  }
}
