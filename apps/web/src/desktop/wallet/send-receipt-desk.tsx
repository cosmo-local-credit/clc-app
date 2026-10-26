import { recipientLabel as formatRecipientLabel } from "@clc/api/features/recipients/client";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { formatUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { RedemptionReviewPrompt } from "#/components/reviews/redemption-review-prompt";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import {
  FailureCross,
  PendingClock,
  ShareReceiptButton,
  SignedAmount,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { SendSharePanel } from "#/features/wallet/ui/send-receipt-page";
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

  return (
    <DeskCanvas>
      <div className="flex items-center gap-3">
        {icon}
        <DeskTitle>{title}</DeskTitle>
      </div>
      {outcome.kind === "pending" ? (
        <p className="mt-3 text-sm">
          <Trans>Waiting for on-chain confirmation</Trans>
        </p>
      ) : null}
      {outcome.kind === "error" ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {outcome.error}
        </p>
      ) : null}

      <div className="mt-6 max-w-xl border border-border bg-card">
        <ReceiptRow label={<Trans>Amount</Trans>}>
          {amountLabel ? <SignedAmount direction="out" amount={amountLabel} /> : <Dash />}
        </ReceiptRow>
        <ReceiptRow label={<Trans>Recipient</Trans>}>
          {toAddress ? (
            <RecipientIdentityLabel
              address={toAddress}
              fallback={fallbackRecipientLabel ?? undefined}
              showAddress
            />
          ) : (
            <Dash />
          )}
        </ReceiptRow>
        <ReceiptRow label={<Trans>Transaction</Trans>}>
          {txHash ? (
            <CopyableInfoValue value={txHash} label={t`Copy transaction hash`} onCopy={copy} />
          ) : outcome.kind === "pending" ? (
            <span className="font-mono text-xs">
              <Trans>Pending</Trans>
            </span>
          ) : (
            <Dash />
          )}
        </ReceiptRow>
        <ReceiptRow label={<Trans>Network</Trans>}>
          <span className="text-xs font-semibold">{CHAIN_INFO.name}</span>
        </ReceiptRow>
        <ReceiptRow label={<Trans>Submitted</Trans>}>
          {submittedAt && submittedStamp ? (
            <time className="font-mono text-xs font-semibold" dateTime={submittedStamp} dir="ltr">
              {submittedAt}
            </time>
          ) : outcome.kind === "pending" ? (
            <span className="font-mono text-xs">
              <Trans>Pending</Trans>
            </span>
          ) : (
            <Dash />
          )}
        </ReceiptRow>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-xs text-muted-foreground">
            <Trans>Status</Trans>
          </span>
          {status}
        </div>
      </div>

      {outcome.kind === "success" && token && recipient ? (
        <div className="mt-4 max-w-xl">
          <RedemptionReviewPrompt address={token} recipient={recipient} />
        </div>
      ) : null}
      {outcome.kind === "success" && txHash && toAddress ? (
        <div className="mt-4 max-w-xl">
          <SendSharePanel
            txHash={txHash}
            recipientAddress={toAddress}
            tokenAddress={token}
            voucherSymbol={symbol ?? ""}
          />
        </div>
      ) : null}

      <div className="mt-6 flex max-w-xl flex-col gap-2">
        {explorerUrl ? (
          <ShareReceiptButton
            className="w-full"
            title={t`Payment receipt`}
            lines={[
              amountLabel && shareRecipient
                ? t`I sent ${amountLabel} to ${shareRecipient}.`
                : t`I sent a payment.`,
              ...(toAddress && shareRecipient !== toAddress ? [`${t`Address`}: ${toAddress}`] : []),
              ...(submittedAt ? [submittedAt] : []),
            ]}
            url={explorerUrl}
          />
        ) : null}
        <Button
          type="button"
          onClick={() => {
            void navigate({
              to: "/",
              search: { tab: "activity", ...(txHash ? { tx: txHash } : {}) },
            });
          }}
        >
          <Trans>Done</Trans>
        </Button>
        {explorerUrl ? (
          <Button asChild variant="outline">
            <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
              {CHAIN_INFO.explorerName}
            </a>
          </Button>
        ) : null}
      </div>
    </DeskCanvas>
  );
}

function ReceiptRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Dash() {
  return (
    <span className="font-mono text-xs text-muted-foreground" dir="ltr">
      —
    </span>
  );
}
