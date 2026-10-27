import { recipientLabel as formatRecipientLabel } from "@clc/api/features/recipients/client";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { formatUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { RiExternalLinkLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { RedemptionReviewPrompt } from "#/components/reviews/redemption-review-prompt";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import {
  FailureCross,
  PendingClock,
  ShareReceiptButton,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskCanvas, DeskRow, DeskRowList, DeskTitle } from "#/desktop/ui/page";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { SendSharePanel } from "#/features/wallet/ui/send-receipt-page";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useAddressBookRecipients } from "#/features/wallet/hooks/use-address-book";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";
import { cn } from "#/lib/utils";

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

  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy transaction hash`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Transaction hash copied`))
      .catch(() => toast.error(t`Couldn't copy transaction hash`));
  };

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

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        dimmed
        main={
          <DeskCanvas>
            <DeskTitle>
              <Trans>Wallet</Trans>
            </DeskTitle>
            <RecentActivity />
          </DeskCanvas>
        }
        side={
          <DeskInspector title={title} onClose={done}>
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="shrink-0">{icon}</span>
              <div className="grid min-w-0">
                <span className="truncate font-mono text-xl font-semibold" dir="ltr">
                  {amount && symbol ? `${amount} ${symbol}` : "—"}
                </span>
                {shareRecipient ? (
                  <span className="truncate text-xs text-muted-foreground">
                    <Trans>
                      to{" "}
                      <span dir={shareRecipient.startsWith("0x") ? "ltr" : "auto"}>
                        {shareRecipient}
                      </span>
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
                    <span key="recipient-value" className="grid min-w-0" title={toAddress}>
                      {fallbackRecipientLabel || recipientIdentity.data ? (
                        <span className="truncate font-sans" dir="auto">
                          {recipientIdentity.data
                            ? formatRecipientLabel(recipientIdentity.data)
                            : fallbackRecipientLabel}
                        </span>
                      ) : null}
                      <span className="truncate" dir="ltr">
                        {formatVoucherAddress(toAddress as `0x${string}`)}
                      </span>
                    </span>
                  ) : (
                    <Dash key="recipient-value" />
                  ),
                ],
                [
                  <Trans key="tx">Transaction</Trans>,
                  txHash ? (
                    <CopyableInfoValue
                      key="tx-value"
                      value={txHash}
                      label={t`Copy transaction hash`}
                      onCopy={copy}
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
                    <span
                      key="submitted-value"
                      className="font-sans font-normal text-muted-foreground"
                    >
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
            {outcome.kind === "success" && token && recipient ? (
              <RedemptionReviewPrompt address={token} recipient={recipient} />
            ) : null}
            {outcome.kind === "success" && txHash && toAddress ? (
              <SendSharePanel
                txHash={txHash}
                recipientAddress={toAddress}
                tokenAddress={token}
                voucherSymbol={symbol ?? ""}
              />
            ) : null}
            <div className={cn("grid gap-4", explorerUrl && "grid-cols-2")}>
              {explorerUrl ? (
                <ShareReceiptButton
                  className="w-full min-w-0"
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
              ) : null}
              <Button type="button" className="w-full min-w-0" onClick={done}>
                <Trans>Done</Trans>
              </Button>
            </div>
            {explorerUrl ? (
              <Button asChild variant="outline" className="w-full min-w-0">
                <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
                  <span className="truncate">{CHAIN_INFO.explorerName}</span>
                  <RiExternalLinkLine aria-hidden="true" />
                </a>
              </Button>
            ) : null}
          </DeskInspector>
        }
      />
    </div>
  );
}

/** The wallet's latest activity, dimmed behind the receipt. */
function RecentActivity() {
  const { i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const { address } = useConnection();
  const activityQuery = useAccountActivityInfinite(address);
  const rows = (activityQuery.data?.pages.flatMap((page) => page.activity) ?? []).slice(0, 6);
  if (rows.length === 0) return null;
  return (
    <DeskRowList>
      {rows.map((item) => {
        const leg = item.kind === "swapped" ? item.received : item.transfer;
        const incoming = item.kind !== "sent";
        const other =
          item.kind === "swapped"
            ? (item.poolAddresses[0] ?? null)
            : item.kind === "creation"
              ? null
              : item.counterpartyAddress;
        return (
          <DeskRow
            key={`${item.id}:${item.txHash}`}
            title={other ? <CounterpartyName address={other} /> : <Trans>New supply</Trans>}
            subtitle={
              <time className="font-mono" dateTime={item.dateBlock}>
                {formatTransferDate(item.dateBlock, locale)}
              </time>
            }
            trail={
              <span
                className={cn(
                  "shrink-0 font-mono text-sm font-semibold",
                  incoming && "text-success-ink",
                )}
                dir="ltr"
              >
                {incoming ? "+" : "−"}
                {formatTokenAmount(leg.amount, leg.tokenDecimals)} {leg.tokenSymbol}
              </span>
            }
          />
        );
      })}
    </DeskRowList>
  );
}

function CounterpartyName({ address }: { address: string }) {
  const identity = useReverseRecipientResolution(address);
  return identity.data ? (
    <RecipientIdentityText identity={identity.data} />
  ) : (
    <span className="font-mono" dir="ltr">
      {formatVoucherAddress(address as `0x${string}`)}
    </span>
  );
}

function Dash() {
  return (
    <span className="text-muted-foreground" dir="ltr">
      —
    </span>
  );
}
