import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiArrowLeftLine, RiShareLine } from "react-icons/ri";

import { InstallInstructions } from "#/components/install-instructions";
import { InstallAppButton } from "#/components/install-app-button";
import { LanguageSelector } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { Input } from "#/components/ui/input";
import { useInstallStore } from "../install-store";

export function InstallPage() {
  const { t } = useLingui();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { installed, status } = useInstallStore();
  const [shareUrl, setShareUrl] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "manual">("idle");
  useEffect(() => {
    // Do not share wallet import keys, search params, or URL fragments.
    setShareUrl(new URL("/install", window.location.origin).href);
  }, []);

  async function share() {
    setShareStatus("idle");
    if (navigator.share) {
      try {
        await navigator.share({ title: t`Install CLC`, url: shareUrl });
        return;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError"
        )
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("copied");
    } catch {
      setShareStatus("manual");
    }
  }

  return (
    <main className="flex min-h-[100svh] flex-col gap-8 bg-background px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            if (canGoBack) router.history.back();
            else void router.navigate({ to: "/", search: { tab: "market" }, replace: true });
          }}
        >
          <RiArrowLeftLine className="rtl:-scale-x-100" aria-hidden="true" />
          <Trans>Back</Trans>
        </Button>
        <LanguageSelector />
      </div>

      <header className="space-y-4">
        <CLCLogo className="size-14" sharp />
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>CLC on your home screen</Trans>
        </h1>
        <p className="text-muted-foreground">
          <Trans>Open your wallet and community market with one tap from your phone.</Trans>
        </p>
      </header>

      <section className="space-y-4" aria-label={t`App installation`}>
        {installed ? (
          <p role="status" className="border border-border bg-card p-4 text-primary">
            <Trans>CLC is installed. Find it on your home screen.</Trans>
          </p>
        ) : status === "accepted" ? (
          <p role="status" className="border border-border bg-card p-4">
            <Trans>Installation requested. Follow your browser's instructions to finish.</Trans>
          </p>
        ) : (
          <>
            <InstallAppButton />
            {status === "dismissed" ? (
              <p role="status" className="text-muted-foreground text-sm">
                <Trans>
                  Installation cancelled. You can keep using CLC in your browser or install it
                  later.
                </Trans>
              </p>
            ) : null}
            <div className="space-y-3 border border-border bg-card p-4">
              <h2>
                <Trans>Add CLC to your phone</Trans>
              </h2>
              <InstallInstructions />
            </div>
          </>
        )}
        <Button asChild variant="outline" className="h-11 w-full">
          <Link to="/" search={{ tab: "market" }}>
            {installed ? <Trans>Continue to CLC</Trans> : <Trans>Continue in browser</Trans>}
          </Link>
        </Button>
      </section>

      <section
        className="space-y-3 border-t border-border pt-6"
        aria-labelledby="share-install-title"
      >
        <h2 id="share-install-title">
          <Trans>Share CLC</Trans>
        </h2>
        <p className="text-muted-foreground text-sm">
          <Trans>Send this link to help someone add CLC to their phone.</Trans>
        </p>
        <Input
          aria-label={t`Installation link`}
          value={shareUrl}
          readOnly
          onFocus={(event) => event.target.select()}
        />
        <Button
          variant="outline"
          className="h-11 w-full"
          disabled={!shareUrl}
          onClick={() => void share()}
        >
          <RiShareLine aria-hidden="true" />
          <Trans>Share installation link</Trans>
        </Button>
        <p role="status" className="text-muted-foreground text-sm">
          {shareStatus === "copied" ? <Trans>Link copied. Paste it into a message.</Trans> : null}
          {shareStatus === "manual" ? (
            <Trans>Select and copy the link above to share it.</Trans>
          ) : null}
        </p>
      </section>
    </main>
  );
}
