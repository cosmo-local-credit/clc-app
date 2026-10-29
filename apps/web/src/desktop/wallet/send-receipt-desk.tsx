import { recipientLabel as formatRecipientLabel } from "@clc/api/features/recipients/client";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { formatUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { RiExternalLinkLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  FailureCross,
  PendingClock,
  ShareReceiptButton,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskDetail, DeskTitle } from "#/desktop/ui/page";
import { FullValue } from "#/desktop/ui/full-value";
import { RedemptionReviewDesk, SendShareDesk } from "#/desktop/wallet/send-share-desk";
import { Dash } from "#/desktop/wallet/wallet-parts";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useAddressBookRecipients } from "#/features/wallet/hooks/use-address-book";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { CHAIN_INFO } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

function formatSubmittedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function SendReceiptDesk() {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const {
    token,
    trackingId,
    recipient,
    recipientLabel: submittedRecipientLabel,
    amount,
    symbol,
    uoaValue,
    uoa,
    uoaUnavailable,
  } = useSearch({ from: "/wallet/send/receipt" });
  useDeskTrailLabel(symbol ?? null);
  const tracking = useOtxTracking(trackingId ?? null, {
    queryKey: "send-relay-track",
    queryFn: async (nextTrackingId) => (await relayerClient.trackRelay(nextTrackingId)).result,
  });
  const toAddress = recipient ?? null;
  const recipientIdentity = useReverseRecipientResolution(toAddress);
  const addressBook = useAddressBookRecipients(useStorageOwner());
  const fallbackRecipientLabel =
    toAddress === null
      ? null
      : ((addressBook.data ?? []).find(
          (entry) =>
            entry.address.toLowerCase() === toAddress.toLowerCase() &&
            !entry.label.toLowerCase().startsWith("0x"),
        )?.label ??
        (submittedRecipientLabel?.trim() || null));
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const localizedUoaValue = uoaValue ? formatUnitOfAccountDisplayValue(uoaValue, locale) : null;
  const uoaLabel =
    localizedUoaValue && uoa
      ? `${localizedUoaValue} ${uoa}`
      : uoaUnavailable
        ? t`Unavailable`
        : null;
  const amountLabel =
    amount && symbol ? `${amount} ${symbol}${uoaLabel ? ` (${uoaLabel})` : ""}` : null;
  const outcome = tracking.outcome;
  const txHash = outcome.kind === "success" && outcome.otx.txHash ? outcome.otx.txHash : null;
  const explorerUrl = txHash ? explorerTxUrl(CHAIN_INFO, txHash) : null;
  const shareRecipient = recipientIdentity.data
    ? formatRecipientLabel(recipientIdentity.data)
    : (fallbackRecipientLabel ?? toAddress);
  const submittedAt =
    outcome.kind === "success" && outcome.otx.createdAt
      ? formatSubmittedAt(outcome.otx.createdAt, locale)
      : null;
  const submittedStamp = outcome.kind === "success" ? outcome.otx.createdAt : undefined;

  const title =
    outcome.kind === "success" ? (
      <Trans>Sent</Trans>
    ) : outcome.kind === "error" ? (
      <Trans>Reverted</Trans>
    ) : (
      <Trans>Sending</Trans>
    );
  const icon =
    outcome.kind === "success" ? (
      <SuccessCheck />
    ) : outcome.kind === "error" ? (
      <FailureCross />
    ) : (
      <PendingClock />
    );
  const status =
    outcome.kind === "success" ? (
      <StatusPill tone="success" label={<Trans>Confirmed</Trans>} />
    ) : outcome.kind === "error" ? (
      <StatusPill tone="error" label={<Trans>Reverted</Trans>} />
    ) : (
      <StatusPill tone="pending" label={<Trans>Pending</Trans>} />
    );

  function done() {
    void navigate({
      to: "/",
      search: { tab: "activity", ...(txHash ? { tx: txHash } : {}) },
    });
  }

  const hasExtras =
    outcome.kind === "success" && Boolean((token && recipient) || (txHash && toAddress));

  const main = (
    <>
      <DeskTitle>{title}</DeskTitle>
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="shrink-0">{icon}</span>
        <div className="grid min-w-0">
          <span className="font-mono text-xl font-semibold [overflow-wrap:anywhere]" dir="ltr">
            {amount && symbol ? `${amount} ${symbol}` : "—"}
          </span>
          {shareRecipient ? (
            <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              <Trans>
                to{" "}
                <span dir={shareRecipient.startsWith("0x") ? "ltr" : "auto"}>{shareRecipient}</span>
              </Trans>
            </span>
          ) : null}
        </div>
      </div>
      {outcome.kind === "pending" ? (
        <p className="text-sm">
          <Trans>Waiting for on-chain confirmation</Trans>
        </p>
      ) : null}
      {outcome.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {outcome.error}
        </p>
      ) : null}
      <DeskKV
        rows={[
          [
            <Trans key="amount">Amount</Trans>,
            amountLabel ? (
              <span key="amount-value" dir="ltr">
                {amountLabel}
              </span>
            ) : (
              <Dash key="amount-value" />
            ),
          ],
          [
            <Trans key="recipient">Recipient</Trans>,
            toAddress ? (
              <span key="recipient-value" className="grid min-w-0 gap-1.5">
                {fallbackRecipientLabel || recipientIdentity.data ? (
                  <span className="font-sans" dir="auto">
                    {recipientIdentity.data
                      ? formatRecipientLabel(recipientIdentity.data)
                      : fallbackRecipientLabel}
                  </span>
                ) : null}
                <FullValue
                  value={toAddress}
                  copyLabel={t`Copy recipient address`}
                  copiedMessage={t`Address copied`}
                  failedMessage={t`Couldn't copy address`}
                />
              </span>
            ) : (
              <Dash key="recipient-value" />
            ),
          ],
          [
            <Trans key="tx">Transaction</Trans>,
            txHash ? (
              <FullValue
                key="tx-value"
                value={txHash}
                copyLabel={t`Copy transaction hash`}
                copiedMessage={t`Transaction hash copied`}
                failedMessage={t`Couldn't copy transaction hash`}
              />
            ) : outcome.kind === "pending" ? (
              <span key="tx-value" className="font-sans font-normal text-muted-foreground">
                <Trans>Pending</Trans>
              </span>
            ) : (
              <Dash key="tx-value" />
            ),
          ],
          [
            <Trans key="network">Network</Trans>,
            <span key="network-value" className="font-sans">
              {CHAIN_INFO.name}
            </span>,
          ],
          [
            <Trans key="submitted">Submitted</Trans>,
            submittedAt && submittedStamp ? (
              <time key="submitted-value" dateTime={submittedStamp} dir="ltr">
                {submittedAt}
              </time>
            ) : outcome.kind === "pending" ? (
              <span key="submitted-value" className="font-sans font-normal text-muted-foreground">
                <Trans>Pending</Trans>
              </span>
            ) : (
              <Dash key="submitted-value" />
            ),
          ],
          [
            <Trans key="status">Status</Trans>,
            <span key="status-value" className="font-sans">
              {status}
            </span>,
          ],
        ]}
      />
    </>
  );

  const extras = (
    <>
      {outcome.kind === "success" && token && recipient ? (
        <RedemptionReviewDesk address={token} recipient={recipient} />
      ) : null}
      {outcome.kind === "success" && txHash && toAddress ? (
        <SendShareDesk
          txHash={txHash}
          recipientAddress={toAddress}
          tokenAddress={token}
          voucherSymbol={symbol ?? ""}
        />
      ) : null}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasExtras ? (
          <DeskDetail main={main} side={extras} />
        ) : (
          <DeskCanvas className="max-w-[720px]">{main}</DeskCanvas>
        )}
      </div>
      {/* Done and sharing stay in view beside the scrolling receipt. */}
      <div className="shrink-0 border-border border-t bg-card">
        <div className="flex w-full max-w-[1324px] flex-wrap items-center justify-end gap-3 px-6 py-3 @4xl:px-8">
          {explorerUrl ? (
            <>
              <Button asChild variant="outline">
                <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
                  <span className="[overflow-wrap:anywhere]">{CHAIN_INFO.explorerName}</span>
                  <RiExternalLinkLine aria-hidden="true" />
                </a>
              </Button>
              <ShareReceiptButton
                title={t`Payment receipt`}
                lines={[
                  amountLabel && shareRecipient
                    ? t`I sent ${amountLabel} to ${shareRecipient}.`
                    : t`I sent a payment.`,
                  ...(toAddress && shareRecipient !== toAddress
                    ? [`${t`Address`}: ${toAddress}`]
                    : []),
                  ...(submittedAt ? [submittedAt] : []),
                ]}
                url={explorerUrl}
              />
            </>
          ) : null}
          <Button type="button" onClick={done}>
            <Trans>Done</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
