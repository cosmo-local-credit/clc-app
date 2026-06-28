import { Trans } from "@lingui/react/macro";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { SignInPanel } from "./sign-in-panel";
import { sanitizeInternalRedirect } from "./redirect";

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const auth = useAuthStatus();

  if (auth.isLoading) return <AuthRouteFallback />;
  if (auth.isAuthenticated) return <>{children}</>;
  if (auth.state === "sessionCheckError") return <SessionCheckError onRetry={auth.retry} />;
  return <AuthRequiredScreen />;
}

function AuthRouteFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}

function SessionCheckError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-20 pb-12">
      <div className="rounded-xl border border-border bg-card p-4">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Session check failed</Trans>
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>We could not verify your session. Check your connection and try again.</Trans>
        </p>
        <Button className="mt-4 h-11 w-full" onClick={onRetry}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    </div>
  );
}

function AuthRequiredScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [signInOpen, setSignInOpen] = useState(false);
  const redirectTo = sanitizeInternalRedirect(
    `${location.pathname}${location.searchStr}${location.hash}`,
  );

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-20 pb-12">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Sign in to continue</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>Wallet actions are available after you sign up or sign in.</Trans>
          </p>
        </div>

        <div className="space-y-2">
          <Button className="h-11 w-full" onClick={() => setSignInOpen(true)}>
            <Trans>Sign in</Trans>
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              void navigate({
                to: "/onboarding",
                search: redirectTo ? { redirect: redirectTo } : {},
              });
            }}
          >
            <Trans>Sign up</Trans>
          </Button>
        </div>

        <Link
          to="/"
          className="block text-center text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
        >
          <Trans>Back to market</Trans>
        </Link>
      </div>

      <DialogRoot open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="p-0">
            <div className="p-6">
              <DialogTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
                <Trans>Sign in</Trans>
              </DialogTitle>
              <p className="mb-4 mt-1 text-muted-foreground text-sm">
                <Trans>Choose a wallet to continue.</Trans>
              </p>
              <SignInPanel
                redirectTo={redirectTo}
                onAuthenticated={() => setSignInOpen(false)}
                onCancel={() => setSignInOpen(false)}
              />
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </div>
  );
}
