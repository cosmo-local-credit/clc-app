import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { lazy, type ReactNode, Suspense } from "react";
import { LoadingBlock } from "#/components/admin/loading-block";
import { type AdminSession, SUPERADMIN_ROLE, useAdminSession } from "#/features/auth/admin-session";
import type { SignInNotice } from "#/features/auth/ui/sign-in-panel";

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

  // Every other state lands on sign-in, carrying a notice when there is something
  // to explain. An operator holding the wrong account recovers by signing in with
  // the right one, so the form is the destination rather than a dead-end screen.
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <LoadingBlock rows={4} />
        </div>
      }
    >
      <SignInPanel notice={noticeFor(session)} />
    </Suspense>
  );
}

/** Exhaustive over the blocked states, so a new one fails to compile until handled. */
function noticeFor(
  session: Exclude<AdminSession, { status: "loading" } | { status: "authenticated" }>,
): SignInNotice | undefined {
  switch (session.status) {
    case "unauthenticated":
      return undefined;
    case "unauthorized":
      // Address, current role, required role — and nothing else.
      return {
        title: "Not authorized",
        description:
          `${formatVoucherAddress(session.operator.address as `0x${string}`)} is ` +
          `${session.operator.role}. Requires ${SUPERADMIN_ROLE}.`,
        // A stale session cookie is still set, so offer the way out of it.
        signedIn: true,
      };
    case "unavailable":
      return { title: "Session check failed", description: session.message };
  }
}
