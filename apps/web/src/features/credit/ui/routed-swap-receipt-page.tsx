import { routedSwapQueryOptions } from "@clc/api/features/credit-router/queries";
import { poolQueryOptions } from "@clc/api/features/pools/queries";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { FailureCross, PendingClock, StatusPill, SuccessCheck } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useVoucherLabels } from "#/features/credit/hooks/use-voucher-labels";
import { creditRouterClient } from "#/lib/api/credit-router";
import { poolsClient } from "#/lib/api/pools";
import { CHAIN_INFO } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";
import { cn } from "#/lib/utils";
import { CreditFailureNotice } from "./credit-failure-notice";

const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * One routed exchange as one receipt: the relay's dispatch status, then each
 * hop's settlement as the subscriber records it. Read from the server, so the
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

  const outcome = tracking.outcome;
  const reverted = outcome.kind === "error" || swap?.status === "REVERTED";
  const confirmed = !reverted && (outcome.kind === "success" || swap?.status === "SUCCESS");
  const lastHop = swap?.hops.at(-1);
  const received = lastHop?.amountOut ?? null;
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
            <Trans>Exchanging</Trans>
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
            <ReceiptRow label={<Trans>You spent</Trans>}>
              {amount(swap.tokenIn, swap.amountIn)}
            </ReceiptRow>
            <ReceiptRow label={<Trans>You received</Trans>}>
              {received !== null ? amount(swap.tokenOut, received) : "—"}
            </ReceiptRow>
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
                  onCopy={(value) => void navigator.clipboard?.writeText(value)}
                />
              </ReceiptRow>
            ) : null}
            <ReceiptRow label={<Trans>Status</Trans>} last>
              <StatusPill
                tone={reverted ? "error" : confirmed ? "success" : "pending"}
                label={reverted ? t`Reverted` : confirmed ? t`Confirmed` : t`Pending`}
              />
            </ReceiptRow>
          </div>

          {swap.hops.map((hop, index) => (
            <div key={hop.index} className="mt-3 border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <span className="min-w-0 truncate text-sm font-semibold">
                  <Trans>
                    Hop {index + 1} · {poolNames[index] ?? hop.pool}
                  </Trans>
                </span>
                <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
                  {labels.get(hop.tokenIn.toLowerCase())?.symbol ?? "—"} →{" "}
                  {labels.get(hop.tokenOut.toLowerCase())?.symbol ?? "—"}
                </span>
              </div>
              <ReceiptRow label={<Trans>Sent</Trans>}>
                {amount(hop.tokenIn, hop.settledAmountIn ?? hop.amountIn)}
              </ReceiptRow>
              <ReceiptRow label={<Trans>Pool fee</Trans>}>
                {amount(hop.tokenOut, hop.poolFee)}
              </ReceiptRow>
              <ReceiptRow label={<Trans>Protocol fee</Trans>}>
                {amount(hop.tokenOut, hop.protocolFee)}
              </ReceiptRow>
              <ReceiptRow label={<Trans>Received</Trans>} last>
                {hop.settledAt ? amount(hop.tokenOut, hop.amountOut) : <Trans>Settling…</Trans>}
              </ReceiptRow>
            </div>
          ))}
        </>
      ) : receipt.isPending && wallet ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
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
