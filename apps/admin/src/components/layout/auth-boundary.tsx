import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Fragment, lazy, type ReactNode, Suspense } from "react";
import { LoadingBlock } from "#/components/admin/loading-block";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  ADMIN_ROLE_LABEL,
  type AdminSession,
  useAdminSession,
} from "#/features/auth/admin-session";
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
const RegionalWorkspace = lazy(() =>
  import("#/features/regions/regional-workspace").then((module) => ({
    default: module.RegionalWorkspace,
  })),
);

/**
 * This is a UX gate only. clc-core enforces administrative access on every admin
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

  if (session.status === "authenticated")
    return <Fragment key={session.operator.address.toLowerCase()}>{children}</Fragment>;

  if (session.status === "regional") {
    return (
      <Suspense
        fallback={
          <div className="p-6">
            <LoadingBlock rows={4} />
          </div>
        }
      >
        <RegionalWorkspace
          key={session.operator.address.toLowerCase()}
          viewer={session.operator.address}
        />
      </Suspense>
    );
  }

  if (session.status === "unavailable") {
    return (
      <div className="max-w-xl space-y-3 p-6">
        <Alert>
          <AlertTitle>Session check failed</AlertTitle>
          <AlertDescription>{session.message}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          type="button"
          disabled={session.retrying}
          aria-busy={session.retrying}
          onClick={session.retry}
        >
          {session.retrying ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }

  // An operator holding the wrong account can sign in with the right one.
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <LoadingBlock rows={4} />
        </div>
      }
    >
      <SignInPanel notice={session.status === "unauthorized" ? noticeFor(session) : undefined} />
    </Suspense>
  );
}

function noticeFor(session: Extract<AdminSession, { status: "unauthorized" }>): SignInNotice {
  return {
    title: "Not authorized",
    description:
      `${formatVoucherAddress(session.operator.address as `0x${string}`)} is ` +
      `${session.operator.role}. Requires ${ADMIN_ROLE_LABEL}.`,
    // The session cookie is still set, so offer the way out of it.
    signedIn: true,
  };
}
