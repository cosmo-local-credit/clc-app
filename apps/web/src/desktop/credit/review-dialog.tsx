import { formatFeePpm } from "@clc/core/features/credit-router/logic";
import { Trans } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { SectionHeading } from "#/components/ui/section-heading";
import { DeskKV } from "#/desktop/ui/kv";
import { CreditQuoteRefusedError } from "#/features/credit/api/relay-credit-quote";
import type { CreditGet } from "#/features/credit/hooks/use-credit-get";
import { amountOf, symbolOf, type Labels } from "#/features/credit/logic/credit-display";
import { CreditFailureNotice } from "#/features/credit/ui/credit-failure-notice";
import { CreditPoolLink } from "#/features/credit/ui/credit-pool-link";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";

export function CreditReviewDialog({
  get,
  labels,
  locale,
}: {
  get: CreditGet;
  labels: Labels;
  locale: string;
}) {
  const { review } = get;
  const quote = review?.quote;
  const amount = (address: string, raw: string) =>
    `${amountOf(labels, address, raw, locale) ?? "—"} ${symbolOf(labels, address)}`;
  const fee = (address: string, raw: string) => {
    const decimals = labels.get(address.toLowerCase())?.decimals;
    return decimals == null
      ? "—"
      : `${formatPoolSwapFee(raw, decimals, locale)} ${symbolOf(labels, address)}`;
  };

  return (
    <DialogRoot
      open={!!review}
      onOpenChange={(open) => {
        if (!open) get.closeReview();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent
          closeButtonDisabled={get.relaying}
          className="flex max-h-[calc(100dvh-3rem)] max-w-[720px] flex-col gap-0 rounded-none border border-border bg-card p-0 shadow-none"
        >
          <div className="shrink-0 border-border border-b px-5 py-4 pe-14">
            <DialogTitle>
              <Trans>Confirm exchange</Trans>
            </DialogTitle>
          </div>
          {quote && review ? (
            <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-5">
              <DeskKV
                labelWidth="150px"
                rows={[
                  [
                    <Trans key="label">You spend</Trans>,
                    amount(quote.hops[0]!.tokenIn, quote.amountIn),
                  ],
                  [
                    <Trans key="label">You get</Trans>,
                    amount(quote.hops.at(-1)!.tokenOut, quote.amountOut),
                  ],
                  quote.mode === "exactInput" && [
                    <Trans key="label">Minimum received</Trans>,
                    amount(quote.hops.at(-1)!.tokenOut, quote.minAmountOut),
                  ],
                  quote.mode === "exactOutput" &&
                    BigInt(quote.surplus.output) > 0n && [
                      <Trans key="label">Extra received</Trans>,
                      amount(quote.hops.at(-1)!.tokenOut, quote.surplus.output),
                    ],
                  [
                    <Trans key="label">Fee</Trans>,
                    formatFeePpm(quote.fees.effectiveFeePpm, locale) ?? "—",
                  ],
                ]}
              />
              <section className="grid gap-3">
                <SectionHeading as="h2" variant="section">
                  <Trans>Route details</Trans>
                </SectionHeading>
                <ol className="grid gap-3">
                  {quote.hops.map((hop, index) => (
                    <li key={`${hop.pool}-${index}`} className="grid gap-2">
                      <p className="break-words text-sm font-semibold">
                        <span className="font-mono">
                          {new Intl.NumberFormat(locale).format(index + 1)}.
                        </span>{" "}
                        <CreditPoolLink
                          address={review.route.hops[index]?.pool.address ?? hop.pool}
                          name={review.route.hops[index]?.pool.name ?? hop.pool}
                        />
                        {" · "}
                        <span dir="ltr" className="font-mono text-xs">
                          {symbolOf(labels, hop.tokenIn)} → {symbolOf(labels, hop.tokenOut)}
                        </span>
                      </p>
                      <DeskKV
                        labelWidth="150px"
                        rows={[
                          [<Trans key="label">Pool fee</Trans>, fee(hop.tokenOut, hop.poolFee)],
                          [
                            <Trans key="label">Protocol fee</Trans>,
                            fee(hop.tokenOut, hop.protocolFee),
                          ],
                        ]}
                      />
                    </li>
                  ))}
                </ol>
              </section>
              <DeskKV
                labelWidth="150px"
                rows={[
                  ...quote.surplus.bridge
                    .filter((entry) => BigInt(entry.amount) > 0n)
                    .map(
                      (entry) =>
                        [
                          <Trans key={entry.voucher}>Left in your wallet</Trans>,
                          amount(entry.voucher, entry.amount),
                        ] as const,
                    ),
                  [
                    <Trans key="label">Quote valid until</Trans>,
                    new Date(quote.expiresAt * 1000).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }),
                  ],
                ]}
              />
              {get.requoted ? (
                <p role="status" className="text-xs text-muted-foreground">
                  <Trans>Amounts changed. Review again.</Trans>
                </p>
              ) : null}
              {get.quoteError ? <CreditFailureNotice error={get.quoteError} /> : null}
              {get.relayError ? <CreditFailureNotice error={get.relayError} /> : null}
            </div>
          ) : null}
          <div className="flex shrink-0 justify-end gap-2 border-border border-t p-5">
            <Button variant="outline" disabled={get.relaying} onClick={get.closeReview}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              pending={get.relaying}
              disabled={get.relayError instanceof CreditQuoteRefusedError}
              onClick={() => void get.confirm()}
            >
              {get.relaying ? <Trans>Signing…</Trans> : <Trans>Confirm</Trans>}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
