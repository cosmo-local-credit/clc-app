import { creditRouterFailure } from "@clc/api/features/credit-router/client";
import { RelayerError } from "@clc/api/features/relayer/client";
import { Trans } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { CreditQuoteRefusedError } from "#/features/credit/api/relay-credit-quote";

/**
 * Why routing, a quote or a relay failed, in the states the router keeps
 * apart, each with its next step. An unavailable router or an unconfirmed
 * price is a retry, never an empty answer; a route that cannot take the
 * amount, or an exchange that would fail, asks for another amount; a listing
 * that changed reloads by itself; a quote the pre-signing checks refused was
 * not signed.
 */
export function CreditFailureNotice({
  error,
  onRetry,
  retrying = false,
  onEdit,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** Takes the person back to the amount, for a route or exchange the amount does not fit. */
  onEdit?: () => void;
}) {
  const failure = creditRouterFailure(error);
  const retryable = failure?.state === "router_unavailable" || failure?.state === "quote_mismatch";
  const editable = failure?.state === "route_unavailable" || failure?.state === "simulation_failed";

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
      ) : onEdit && editable ? (
        <Button variant="outline" tap onClick={onEdit}>
          <Trans>Change amount</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function CreditFailureMessage({ error }: { error: unknown }) {
  if (error instanceof CreditQuoteRefusedError) {
    return <Trans>Quote didn't match your request. Not signed.</Trans>;
  }
  const failure = creditRouterFailure(error);
  switch (failure?.state) {
    case "router_unavailable":
      return <Trans>Exchange unavailable</Trans>;
    case "cursor_stale":
      return <Trans>Options changed. Reloading…</Trans>;
    case "quote_mismatch":
      return <Trans>Price couldn't be confirmed</Trans>;
    case "simulation_failed":
      return failure.revert?.reason ? (
        <Trans>Exchange would fail: {failure.revert.reason}</Trans>
      ) : (
        <Trans>Exchange would fail</Trans>
      );
    case "route_unavailable":
      return <CreditRefusal reason={failure.reason} />;
    default:
      if (error instanceof RelayerError) return <>{error.description}</>;
      return error instanceof Error && error.message ? (
        <>{error.message}</>
      ) : (
        <Trans>Something went wrong.</Trans>
      );
  }
}

/**
 * Why a route cannot take an amount, by the router's refusal reason or the
 * route's limit: the wallet's balance, a pool's credit limit or stock, a
 * retired pool, a wallet the router cannot serve, or anything else.
 */
function CreditRefusal({ reason }: { reason: string }) {
  switch (reason) {
    case "wallet_balance":
    case "wallet":
      return <Trans>More than you have</Trans>;
    case "deposit_cap":
      return <Trans>A pool can't take more right now</Trans>;
    case "liquidity":
      return <Trans>A pool doesn't hold enough</Trans>;
    case "retired":
      return <Trans>A pool is retired</Trans>;
    case "unsupported_wallet":
      return <Trans>Not available for this wallet</Trans>;
    default:
      return <Trans>Not available for this amount</Trans>;
  }
}
