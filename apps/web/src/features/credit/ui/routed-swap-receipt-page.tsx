import { routedSwapQueryOptions } from "@clc/api/features/credit-router/queries";
import { poolQueryOptions } from "@clc/api/features/pools/queries";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { RiArrowDownSLine, RiFileCopyLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Spinner } from "#/components/ui/spinner";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useVoucherLabels } from "#/features/credit/hooks/use-voucher-labels";
import { creditRouterClient } from "#/lib/api/credit-router";
import { poolsClient } from "#/lib/api/pools";
import { CHAIN_INFO } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";
import { cn } from "#/lib/utils";
import { CreditFailureNotice } from "./credit-failure-notice";
import { CreditSwapBreakdown } from "./credit-swap-breakdown";

const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * One routed exchange as one receipt: its state, then what was spent and
 * received, settled amounts once known and quoted ones until then. Each
 * swap's amounts and fees and the transaction's technical data fold into
 * Details. Read from the server and polled until every swap settles, so the
 * receipt survives a refresh and opens on another device.
 */
export function RoutedSwapReceiptPage({ trackingId }: { trackingId: string }) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const navigate = useNavigate();
  const auth = useAuthStatus();
  const wallet = auth.isAuthenticated ? (auth.address ?? "") : "";
  const tracking = useOtxTracking(trackingId, {
    queryKey: "routed-swap-relay-track",
    queryFn: async (id) => (await relayerClient.trackRelay(id)).result,
  });
  const receipt = useQuery(routedSwapQueryOptions(creditRouterClient, wallet, trackingId));
  const swap = receipt.data?.swap;
  const labels = useVoucherLabels(
    swap ? [swap.tokenIn, swap.tokenOut, ...swap.hops.map((hop) => hop.tokenOut)] : [],
  );
  const poolNames = useQueries({
    queries: (swap?.hops ?? []).map((hop) => poolQueryOptions(poolsClient, hop.pool)),
    combine: (results) => results.map((result) => result.data?.name ?? null),
  });
  const amount = (address: string, raw: string | null) => {
    const label = labels.get(address.toLowerCase());
    if (raw === null || label?.decimals === null || label?.decimals === undefined) return "—";
    return `${formatTokenAmountFixed(raw, label.decimals, 2, locale)} ${label.symbol}`;
  };

  const fee = (address: string, raw: string | null) => {
    const label = labels.get(address.toLowerCase());
    if (raw === null || label?.decimals === null || label?.decimals === undefined) return "—";
    return `${formatPoolSwapFee(raw, label.decimals, locale)} ${label.symbol}`;
  };
  const symbol = (address: string) => labels.get(address.toLowerCase())?.symbol ?? "—";
  const copy = (value: string) => void navigator.clipboard?.writeText(value);

  const outcome = tracking.outcome;
  const reverted = outcome.kind === "error" || swap?.status === "REVERTED";
  const confirmed = !reverted && (outcome.kind === "success" || swap?.status === "SUCCESS");
  const firstHop = swap?.hops[0];
  const lastHop = swap?.hops.at(-1);
  // Settled amounts once the first and last swaps have their events; the quote's until then.
  const spent = firstHop?.settledAmountIn ?? swap?.amountIn ?? null;
  const received = lastHop?.settledAt ? lastHop.amountOut : (swap?.minAmountOut ?? null);
  const block = swap?.hops.find((hop) => hop.block !== null)?.block ?? null;
  const txHash = swap?.txHash ?? (outcome.kind === "success" ? outcome.otx.txHash || null : null);
  const explorerUrl = txHash ? explorerTxUrl(CHAIN_INFO, txHash) : null;
  const done = () => void navigate({ to: "/", search: { tab: "activity" }, replace: true });

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-bottom-nav">
      <div className="flex flex-col items-center text-center">
        {reverted ? <FailureCross /> : confirmed ? <SuccessCheck /> : <PendingClock />}
        <h1 className="font-heading mt-3.5 text-[1.75rem] font-bold leading-tight">
          {reverted ? (
            <Trans>Exchange failed</Trans>
          ) : confirmed ? (
            <Trans>Exchanged</Trans>
          ) : (
            <Trans>Exchanging…</Trans>
          )}
        </h1>
        {outcome.kind === "error" ? (
          <p className="mt-2 text-sm text-muted-foreground">{outcome.error}</p>
        ) : null}
      </div>

      {receipt.isError ? (
        <div className="mt-5">
          <CreditFailureNotice
            error={receipt.error}
            onRetry={() => void receipt.refetch()}
            retrying={receipt.isFetching}
          />
        </div>
      ) : null}

      {swap ? (
        <>
          <div className="mt-5 border border-border bg-card">
            <ReceiptRow label={<Trans>You spent</Trans>}>{amount(swap.tokenIn, spent)}</ReceiptRow>
            <ReceiptRow label={<Trans>You received</Trans>} last>
              {amount(swap.tokenOut, received)}
            </ReceiptRow>
          </div>

          <details className="group mt-3 border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 px-3 font-semibold text-sm [&::-webkit-details-marker]:hidden">
              <Trans>Details</Trans>
              <RiArrowDownSLine
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-border">
              {swap.hops.map((hop, index) => (
                <CreditSwapBreakdown
                  key={hop.index}
                  position={formatTokenAmountFixed(String(index + 1), 0, 0, locale)}
                  path={`${symbol(hop.tokenIn)} → ${symbol(hop.tokenOut)}`}
                  poolName={poolNames[index] ?? hop.pool}
                  lines={[
                    {
                      key: "sent",
                      label: <Trans>Sent</Trans>,
                      value: amount(hop.tokenIn, hop.settledAmountIn ?? hop.amountIn),
                    },
                    {
                      key: "pool",
                      label: <Trans>Pool fee</Trans>,
                      value: fee(hop.tokenOut, hop.poolFee),
                    },
                    {
                      key: "protocol",
                      label: <Trans>Protocol fee</Trans>,
                      value: fee(hop.tokenOut, hop.protocolFee),
                    },
                    {
                      key: "received",
                      label: <Trans>Received</Trans>,
                      value: hop.settledAt ? (
                        amount(hop.tokenOut, hop.amountOut)
                      ) : (
                        <Trans>Settling…</Trans>
                      ),
                    },
                  ]}
                />
              ))}
              <ReceiptRow label={<Trans>Minimum received</Trans>}>
                {amount(swap.tokenOut, swap.minAmountOut)}
              </ReceiptRow>
              {receipt.data?.bridgeRemainder
                .filter((entry) => BigInt(entry.amount) > 0n)
                .map((entry) => (
                  <ReceiptRow key={entry.voucher} label={<Trans>Left in your wallet</Trans>}>
                    {amount(entry.voucher, entry.amount)}
                  </ReceiptRow>
                ))}
              {txHash ? (
                <ReceiptRow label={<Trans>Transaction</Trans>}>
                  <CopyableInfoValue
                    value={txHash}
                    label={t`Copy transaction hash`}
                    onCopy={copy}
                  />
                </ReceiptRow>
              ) : null}
              {block !== null ? (
                <ReceiptRow label={<Trans>Block number</Trans>}>{block}</ReceiptRow>
              ) : null}
              <ReceiptRow label={<Trans>Tracking ID</Trans>}>
                {/* A tracking ID is not an address: show all of it, not an 0x-ellipsis. */}
                <button
                  type="button"
                  aria-label={t`Copy tracking ID`}
                  onClick={() => copy(swap.trackingId)}
                  className="flex min-w-0 items-center gap-1.5 bg-card text-end"
                >
                  <span className="min-w-0 break-all">{swap.trackingId}</span>
                  <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                    <RiFileCopyLine className="size-3" aria-hidden="true" />
                  </span>
                </button>
              </ReceiptRow>
              <ReceiptRow label={<Trans>Status</Trans>} last>
                <StatusPill
                  tone={reverted ? "error" : confirmed ? "success" : "pending"}
                  label={reverted ? t`Reverted` : confirmed ? t`Confirmed` : t`Pending`}
                />
              </ReceiptRow>
            </div>
          </details>
        </>
      ) : receipt.isPending && wallet ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
          <Trans>Loading receipt…</Trans>
        </p>
      ) : null}

      <div className="flex-1" />
      <div className="mt-5 flex gap-3">
        {confirmed || reverted ? (
          <Button tap className="flex-1" onClick={done}>
            <Trans>Done</Trans>
          </Button>
        ) : null}
        {explorerUrl ? (
          <Button asChild tap className="flex-1" variant="outline">
            <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
              {CHAIN_INFO.explorerName}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ReceiptRow({
  label,
  last = false,
  children,
}: {
  label: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 px-3 py-2.5",
        !last && "border-b border-border",
      )}
    >
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span dir="ltr" className="min-w-0 break-words text-end font-mono text-xs font-semibold">
        {children}
      </span>
    </div>
  );
}
