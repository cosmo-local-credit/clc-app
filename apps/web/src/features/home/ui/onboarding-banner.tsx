import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SignInPanel } from "#/components/auth/sign-in-panel";
import { LanguageSelector } from "#/components/language-selector";
import { ThemeToggle } from "#/components/theme-selector";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";

export function OnboardingBanner({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30">
      <div className="pointer-events-auto rounded-xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-sm font-semibold">
              <Trans>Join CLC</Trans>
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              <Trans>Sign up to send, swap, redeem, and manage vouchers.</Trans>
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <ThemeToggle />
            <LanguageSelector />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
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
          <Button variant="outline" className="h-11 w-full" onClick={() => setSignInOpen(true)}>
            <Trans>Sign in</Trans>
          </Button>
        </div>
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
