import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { creditFeedback } from "#/components/creditable-browse-control";
import { MarketEmptyMessage } from "#/components/market-empty-message";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import type { useMarketScreen } from "#/features/home/hooks/use-market-screen";
import type { useMarketFilterNotice } from "#/features/home/ui/market-filter-ui";
import type { OutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import { cn } from "#/lib/utils";

type Credit = ReturnType<typeof useCreditableBrowse>;
type MapStatus = ReturnType<typeof useMarketScreen>["mapStatus"];

/** One notice row: the message, and at most one action at its end. */
function NoticeRow({
  tone = "default",
  role,
  action,
  children,
}: {
  tone?: "default" | "destructive";
  role?: "alert" | "status";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex min-h-[52px] min-w-0 items-center justify-between gap-3 border bg-card px-4 py-2",
        tone === "destructive" ? "border-destructive" : "border-border",
      )}
    >
      <div className="min-w-0 text-sm">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A filter or request notice from `useMarketFilterNotice`: its message and its one action. */
export function MarketFilterNotice({
  notice,
}: {
  notice: NonNullable<ReturnType<typeof useMarketFilterNotice>>;
}) {
  return (
    <NoticeRow
      role="alert"
      action={
        notice.actionLabel && notice.onAction ? (
          <Button variant="outline" pending={notice.actionPending} onClick={notice.onAction}>
            {notice.actionLabel}
          </Button>
        ) : null
      }
    >
      {notice.message}
    </NoticeRow>
  );
}

/** What the Credit filter has to say: an invalid link, sign in, checking, or a failed check. */
export function MarketCreditNotice({ credit, onClear }: { credit: Credit; onClear: () => void }) {
  const feedback = creditFeedback(credit);
  if (feedback === "invalid") {
    return (
      <NoticeRow
        tone="destructive"
        role="alert"
        action={
          <Button variant="outline" onClick={onClear}>
            <Trans>Clear filter</Trans>
          </Button>
        }
      >
        <Trans>This link contains an invalid Credit filter.</Trans>
      </NoticeRow>
    );
  }
  if (feedback === "signin") {
    return (
      <NoticeRow
        role="status"
        action={
          <Button asChild>
            <Link to="/onboarding" search={{ step: "welcome" }}>
              <Trans>Sign in</Trans>
            </Link>
          </Button>
        }
      >
        <Trans>Sign in to browse results available through your Credit pools.</Trans>
      </NoticeRow>
    );
  }
  if (feedback === "checking") {
    return (
      <NoticeRow role="status">
        <span className="text-muted-foreground">
          <Trans>Checking Credit availability…</Trans>
        </span>
      </NoticeRow>
    );
  }
  if (feedback === "error") {
    return (
      <NoticeRow
        tone="destructive"
        role="alert"
        action={
          <Button
            variant="outline"
            pending={credit.verification.retrying}
            onClick={credit.verification.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        }
      >
        <Trans>Couldn't check creditable pools.</Trans>
      </NoticeRow>
    );
  }
  return null;
}

/**
 * What the requested output voucher has to say: a bad link, a check that is
 * running, failed or only partly done, or no pool left that can provide it.
 * `showEmpty` is off where the list body already says so itself.
 */
export function MarketOutputNotice({
  output,
  credit,
  onClear,
  onClearAll,
  showEmpty = true,
}: {
  output: OutputVoucherBrowse;
  credit: Credit;
  onClear: () => void;
  onClearAll: () => void;
  showEmpty?: boolean;
}) {
  if (output.state === "invalid") {
    return (
      <NoticeRow
        tone="destructive"
        role="alert"
        action={
          <Button variant="outline" onClick={onClear}>
            <Trans>Clear filter</Trans>
          </Button>
        }
      >
        <Trans>This link contains an invalid output voucher.</Trans>
      </NoticeRow>
    );
  }
  if (output.state === "error") {
    return (
      <NoticeRow
        tone="destructive"
        role="alert"
        action={
          <Button
            variant="outline"
            pending={output.availability.retrying}
            onClick={output.availability.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        }
      >
        <Trans>Couldn't check voucher availability.</Trans>
      </NoticeRow>
    );
  }
  if (output.state === "loading") {
    return (
      <NoticeRow role="status">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          <Trans>Checking voucher availability…</Trans>
        </span>
      </NoticeRow>
    );
  }
  if (output.state === "ready" && showEmpty && output.isEmpty) {
    return (
      <NoticeRow
        action={
          <Button variant="outline" onClick={onClearAll}>
            <Trans>Clear filters</Trans>
          </Button>
        }
      >
        <span className="text-muted-foreground">
          {credit.enabled ? (
            <Trans>No creditable pools have this voucher available.</Trans>
          ) : (
            <Trans>No pools have this voucher available.</Trans>
          )}
        </span>
      </NoticeRow>
    );
  }
  if (output.state === "ready" && output.availability.hasVerificationGaps) {
    return (
      <NoticeRow role="status">
        <span className="text-muted-foreground">
          <Trans>Some pools couldn't be checked. Showing verified results.</Trans>
        </span>
      </NoticeRow>
    );
  }
  return null;
}

/** The map column's one notice slot, drawn from the map screen's status. */
export function MarketMapNotice({
  status,
  credit,
  narrowed,
  onClearCredit,
  onClearFilters,
  onResetLayers,
}: {
  status: MapStatus;
  credit: Credit;
  /** Search, tags, Credit or a requested output narrow what the map shows. */
  narrowed: boolean;
  onClearCredit: () => void;
  /** Clears every narrowing at once: search, tags, Credit and the requested output. */
  onClearFilters: () => void;
  onResetLayers: () => void;
}) {
  if (status === null) return null;
  if (status.kind === "credit")
    return <MarketCreditNotice credit={credit} onClear={onClearCredit} />;
  if (status.kind === "notice") return <MarketFilterNotice notice={status.notice} />;
  if (status.kind === "no-kinds") {
    return (
      <NoticeRow
        action={
          <Button variant="outline" onClick={onResetLayers}>
            <Trans>Reset layers</Trans>
          </Button>
        }
      >
        <span className="text-muted-foreground">
          <Trans>Choose a resource type to show it on the map.</Trans>
        </span>
      </NoticeRow>
    );
  }
  if (status.kind === "empty" && narrowed) {
    return (
      <NoticeRow
        action={
          <Button variant="outline" onClick={onClearFilters}>
            <Trans>Clear filters</Trans>
          </Button>
        }
      >
        <span className="text-muted-foreground">
          <Trans>No marketplace results match this search.</Trans>
        </span>
      </NoticeRow>
    );
  }
  if (status.kind === "credit-empty") {
    return (
      <NoticeRow
        action={
          <Button variant="outline" onClick={onClearFilters}>
            <Trans>Clear filters</Trans>
          </Button>
        }
      >
        <span className="text-muted-foreground">
          <Trans>No marketplace results are available through your Credit pools.</Trans>
        </span>
      </NoticeRow>
    );
  }
  return (
    <NoticeRow>
      <span className="text-muted-foreground">
        <MarketEmptyMessage surface="map" />
      </span>
    </NoticeRow>
  );
}
