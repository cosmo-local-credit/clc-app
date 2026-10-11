import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
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
        <Button variant="outline" size="sm" className="h-9 bg-card" onClick={onClear}>
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
        <Button asChild className="h-11 w-full">
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
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={state.enabled}
            disabled={state.auth.isLoading}
            onCheckedChange={onChange}
          />
          <Trans>Credit</Trans>
          {state.enabled && state.verification.status === "loading" ? (
            <span className="text-xs text-muted-foreground">
              <Trans>Checking…</Trans>
            </span>
          ) : null}
        </label>
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
            size="sm"
            className="h-9 bg-card"
            onClick={state.verification.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
    </>
  );
}
