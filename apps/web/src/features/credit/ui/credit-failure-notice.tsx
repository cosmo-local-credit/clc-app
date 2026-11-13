import { creditRouterFailure } from "@clc/api/features/credit-router/client";
import { RelayerError } from "@clc/api/features/relayer/client";
import { Trans } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { CreditQuoteRefusedError } from "#/features/credit/api/relay-credit-quote";

/**
 * Why routing, a quote or a relay failed, in the states the router keeps
 * apart. An unavailable router is a retry, never an empty answer; a quote the
 * pre-signing checks refused was not signed.
 */
export function CreditFailureNotice({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const failure = creditRouterFailure(error);
  const retryable = failure?.state === "router_unavailable" || failure?.state === "quote_mismatch";

  return (
    <div
      className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
      role="alert"
    >
      <p className="text-sm">
        <CreditFailureMessage error={error} />
      </p>
      {onRetry && (retryable || !failure) ? (
        <Button variant="outline" tap pending={retrying} onClick={onRetry}>
          <Trans>Try again</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function CreditFailureMessage({ error }: { error: unknown }) {
  if (error instanceof CreditQuoteRefusedError) {
    return <Trans>This quote didn't match what you asked for, so it was not signed.</Trans>;
  }
  const failure = creditRouterFailure(error);
  switch (failure?.state) {
    case "router_unavailable":
      return <Trans>Routing is unavailable right now.</Trans>;
    case "cursor_stale":
      return <Trans>The routes changed. Loading them again.</Trans>;
    case "quote_mismatch":
      return <Trans>A pool's price could not be confirmed.</Trans>;
    case "simulation_failed":
      return failure.revert?.reason ? (
        <Trans>This exchange would fail: {failure.revert.reason}.</Trans>
      ) : (
        <Trans>This exchange would fail.</Trans>
      );
    case "route_unavailable":
      return <RouteRefusal reason={failure.reason} />;
    default:
      if (error instanceof RelayerError) return <>{error.description}</>;
      return error instanceof Error && error.message ? (
        <>{error.message}</>
      ) : (
        <Trans>Something went wrong.</Trans>
      );
  }
}

function RouteRefusal({ reason }: { reason: string }) {
  switch (reason) {
    case "deposit_cap":
      return <Trans>A pool on this route can't take more of this voucher right now.</Trans>;
    case "liquidity":
      return <Trans>A pool on this route doesn't hold enough to pay this out.</Trans>;
    case "wallet_balance":
      return <Trans>You don't hold enough for this amount.</Trans>;
    case "retired":
      return <Trans>A pool on this route is retired.</Trans>;
    case "unsupported_wallet":
      return <Trans>This wallet can't use routes.</Trans>;
    default:
      return <Trans>This route can't carry this amount right now.</Trans>;
  }
}
