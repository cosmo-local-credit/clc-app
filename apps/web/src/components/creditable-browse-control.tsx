import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";

type State = ReturnType<typeof useCreditableBrowse>;

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
        <Button
          variant="outline"
          size="lg"
          className={
            state.enabled
              ? "border-destructive bg-destructive px-2.5 text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground"
              : "px-2.5"
          }
          aria-pressed={state.enabled}
          aria-busy={state.enabled && state.verification.status === "loading"}
          disabled={state.auth.isLoading}
          onClick={() => onChange(!state.enabled)}
        >
          <Trans>Credit</Trans>
          {state.enabled && state.verification.status === "loading" ? <Spinner /> : null}
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
