import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiCopperDiamondLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { cn } from "#/lib/utils";

type State = ReturnType<typeof useCreditableBrowse>;

/** Whether the feedback part has anything to say, so a screen can give it the one notice slot. */
export function hasCreditFeedback(state: State): boolean {
  if (!state.parsed.ok) return true;
  if (!state.enabled) return false;
  return (
    state.auth.isLoading || !state.auth.isAuthenticated || state.verification.status === "error"
  );
}

export function CreditableBrowseControl({
  state,
  onChange,
  onClear,
  part = "all",
}: {
  state: State;
  onChange: (checked: boolean) => void;
  onClear: () => void;
  part?: "all" | "control" | "feedback";
}) {
  const showControl = part !== "feedback";
  const showFeedback = part !== "control";
  const checking = state.enabled && state.verification.status === "loading";

  if (!state.parsed.ok) {
    if (!showFeedback) return null;
    return (
      <div
        className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
        role="alert"
      >
        <p className="text-sm">
          <Trans>This link contains an invalid Credit filter.</Trans>
        </p>
        <Button variant="outline" tap onClick={onClear}>
          <Trans>Clear filter</Trans>
        </Button>
      </div>
    );
  }

  if (state.enabled && !state.auth.isLoading && !state.auth.isAuthenticated) {
    if (!showFeedback) return null;
    return (
      <div className="space-y-3 border border-border bg-card p-3" role="status">
        <p className="text-sm">
          <Trans>Sign in to browse results available through your Credit pools.</Trans>
        </p>
        <Button asChild tap className="w-full">
          <Link to="/onboarding" search={{ step: "welcome" }}>
            <Trans>Sign in</Trans>
          </Link>
        </Button>
      </div>
    );
  }

  if (state.enabled && state.auth.isLoading) {
    if (!showFeedback) return null;
    return (
      <div className="border border-border bg-card p-3 text-sm text-muted-foreground" role="status">
        <Trans>Checking Credit availability…</Trans>
      </div>
    );
  }

  return (
    <>
      {showControl && state.auth.isAuthenticated ? (
        // A filter rather than a list: always in the success green, solid while on.
        <Button
          variant="outline"
          tap
          className={cn(
            "font-semibold",
            state.enabled
              ? "border-success! bg-success text-success-foreground hover:bg-success/90 hover:text-success-foreground"
              : "border-[color-mix(in_oklab,var(--color-success)_40%,var(--color-card))]! bg-[color-mix(in_oklab,var(--color-success)_12%,var(--color-card))] text-success-ink hover:bg-[color-mix(in_oklab,var(--color-success)_20%,var(--color-card))] hover:text-success-ink",
          )}
          aria-pressed={state.enabled}
          aria-busy={checking}
          disabled={state.auth.isLoading}
          onClick={() => onChange(!state.enabled)}
        >
          {checking ? <Spinner /> : <RiCopperDiamondLine aria-hidden="true" />}
          <Trans>Credit</Trans>
        </Button>
      ) : null}
      {showFeedback && state.enabled && state.verification.status === "error" ? (
        <div
          className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
          role="alert"
        >
          <p className="text-sm">
            <Trans>Couldn't check creditable pools.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={state.verification.retrying}
            onClick={state.verification.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
    </>
  );
}
