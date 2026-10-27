import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { recipientLabel as formatRecipientLabel } from "@clc/api/features/recipients/client";
import {
  buildOfferingOrderNote,
  OFFERING_ORDER_NOTE_MAX_LENGTH,
  type OfferingOrderLabels,
  type OfferingOrderLine,
} from "@clc/core/features/offerings/order";
import { formatUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { getFieldError } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { OfferingOrderPicker } from "#/components/offerings";
import { RedemptionReviewPrompt } from "#/components/reviews/redemption-review-prompt";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import { Field } from "#/components/ui/field";
import { Textarea } from "#/components/ui/textarea";
import {
  FailureCross,
  PendingClock,
  ShareReceiptButton,
  SignedAmount,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useSendShareForm } from "#/features/wallet/hooks/use-send-share-form";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useAddressBookRecipients } from "#/features/wallet/hooks/use-address-book";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";
import { CHAIN_INFO } from "#/lib/chain";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";

const relayerClient = createRelayerClient(RELAYER_URL);

function ReceiptRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

export function SendReceiptPage({
  token,
  trackingId,
  recipient,
  recipientLabel: submittedRecipientLabel,
  amount,
  symbol,
  uoaValue,
  uoa,
  uoaUnavailable,
  returnPool,
  embedded = false,
}: {
  token?: string;
  trackingId?: string;
  recipient?: string;
  recipientLabel?: string;
  amount?: string;
  symbol?: string;
  /** Exact informational valuation snapshotted when the transfer was submitted. */
  uoaValue?: string;
  uoa?: string;
  uoaUnavailable?: boolean;
  /**
   * The pool a Deposit shortcut started this send from.
   *
   * Carried as an address rather than a path so this screen can only ever exit
   * to a pool, and resolved here rather than with `router.history.back()`: the
   * flow pushed two entries between the pool and this receipt, and one of them
   * is a form that Back must not reopen behind a signed transaction.
   */
  returnPool?: string;
  /** Desktop inspector. The phone screen is unchanged when this is omitted. */
  embedded?: boolean;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
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
  const localizedUoaValue = uoaValue
    ? formatUnitOfAccountDisplayValue(uoaValue, i18n.locales?.[0] ?? i18n.locale)
    : null;
  const uoaLabel =
    localizedUoaValue && uoa
      ? `${localizedUoaValue} ${uoa}`
      : uoaUnavailable
        ? t`Unavailable`
        : null;
  const amountLabel =
    amount && symbol ? `${amount} ${symbol}${uoaLabel ? ` (${uoaLabel})` : ""}` : null;
  const outcome = tracking.outcome;
  const exitReceipt = (txHash?: string | null) => {
    if (returnPool) {
      void navigate({
        to: "/pools/$poolAddress",
        params: { poolAddress: returnPool },
        replace: true,
      });
      return;
    }
    if (embedded && txHash) {
      void navigate({ to: "/", search: { tab: "activity", tx: txHash }, replace: true });
      return;
    }
    void navigate({ to: "/", search: { tab: "wallet" }, replace: true });
  };
  const pageClass = embedded
    ? "flex flex-col"
    : "flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]";

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

  if (outcome.kind === "pending") {
    return (
      <ReceiptShell
        embedded={embedded}
        icon={<PendingClock />}
        title={<Trans>Sending</Trans>}
        amount={amountLabel}
        message={<Trans>Waiting for on-chain confirmation</Trans>}
        toAddress={toAddress}
        recipientLabel={fallbackRecipientLabel}
        status={<StatusPill tone="pending" label={<Trans>Pending</Trans>} />}
      />
    );
  }

  if (outcome.kind === "error") {
    return (
      <ReceiptShell
        embedded={embedded}
        icon={<FailureCross />}
        title={<Trans>Reverted</Trans>}
        amount={amountLabel}
        message={outcome.error}
        toAddress={toAddress}
        recipientLabel={fallbackRecipientLabel}
        status={<StatusPill tone="error" label={<Trans>Reverted</Trans>} />}
        onDone={() => exitReceipt()}
      />
    );
  }

  const txHash = outcome.otx.txHash || null;
  const explorerUrl = txHash ? explorerTxUrl(CHAIN_INFO, txHash) : null;
  const recipientLabel = recipientIdentity.data
    ? formatRecipientLabel(recipientIdentity.data)
    : (fallbackRecipientLabel ?? toAddress);
  const submittedAt = outcome.otx.createdAt
    ? formatSubmittedAt(outcome.otx.createdAt, i18n.locales?.[0] ?? i18n.locale)
    : null;

  return (
    <div className={pageClass}>
      {embedded ? null : (
        <div className="flex flex-col items-center text-center">
          <SuccessCheck />
          <h1 className="font-heading mt-3.5 text-[1.75rem] font-bold leading-tight">
            <Trans>Sent</Trans>
          </h1>
        </div>
      )}

      <div className="my-5 border border-border bg-card">
        {amountLabel ? (
          <ReceiptRow label={t`Amount`}>
            <SignedAmount direction="out" amount={amountLabel} />
          </ReceiptRow>
        ) : null}
        {toAddress ? (
          <ReceiptRow label={t`Recipient`}>
            <RecipientIdentityLabel
              address={toAddress}
              fallback={fallbackRecipientLabel ?? undefined}
              showAddress
            />
          </ReceiptRow>
        ) : null}
        {txHash ? (
          <ReceiptRow label={t`Transaction`}>
            <CopyableInfoValue value={txHash} label={t`Copy transaction hash`} onCopy={copy} />
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={t`Network`}>
          <span className="text-xs font-semibold">{CHAIN_INFO.name}</span>
        </ReceiptRow>
        {submittedAt ? (
          <ReceiptRow label={t`Submitted`}>
            <time className="font-mono text-xs font-semibold" dateTime={outcome.otx.createdAt}>
              {submittedAt}
            </time>
          </ReceiptRow>
        ) : null}
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Status</Trans>
          </span>
          <StatusPill tone="success" label={<Trans>Confirmed</Trans>} />
        </div>
      </div>

      {txHash && toAddress ? (
        <SendSharePanel
          txHash={txHash}
          recipientAddress={toAddress}
          tokenAddress={token}
          voucherSymbol={symbol ?? ""}
        />
      ) : null}
      {token && recipient ? <RedemptionReviewPrompt address={token} recipient={recipient} /> : null}

      <div className="flex-1" />

      {explorerUrl ? (
        <ShareReceiptButton
          className="mb-2.5 w-full"
          title={t`Payment receipt`}
          lines={[
            amountLabel && recipientLabel
              ? t`I sent ${amountLabel} to ${recipientLabel}.`
              : t`I sent a payment.`,
            ...(toAddress && recipientLabel !== toAddress ? [`${t`Address`}: ${toAddress}`] : []),
            ...(submittedAt ? [submittedAt] : []),
          ]}
          url={explorerUrl}
        />
      ) : null}

      {/* Stacked rather than side by side: half a 360px row is too narrow for
          "Back to pool" in German, Dutch, Serbian and Swahili. */}
      <div className="flex flex-col gap-2.5">
        <Button tap onClick={() => exitReceipt(txHash)}>
          {returnPool ? t`Back to pool` : t`Done`}
        </Button>
        {explorerUrl ? (
          <Button asChild tap variant="outline">
            <a href={explorerUrl} rel="noopener noreferrer" target="_blank">
              {CHAIN_INFO.explorerName}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SendSharePanel({
  txHash,
  recipientAddress,
  tokenAddress,
  voucherSymbol,
}: {
  txHash: string;
  recipientAddress: string;
  tokenAddress: string | undefined;
  voucherSymbol: string;
}) {
  const { t } = useLingui();
  const {
    eligibility,
    voucher,
    offeringsQuery,
    offerings,
    orderCheckLoading,
    orderCheckError,
    orderReady,
    orderQuantities,
    changeOrderQuantities,
    orderFormError,
    orderContext,
    orderLines,
    orderLabels,
    hasEmail,
    hasPhone,
    hasLocation,
    form,
    createShare,
  } = useSendShareForm({ txHash, recipientAddress, tokenAddress, voucherSymbol });

  if (eligibility.isPending) {
    return (
      <p className="mb-5 border border-border bg-card p-3 text-muted-foreground text-sm">
        <Trans>Checking message availability…</Trans>
      </p>
    );
  }

  if (eligibility.isError) {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 border border-border bg-card p-3">
        <p className="text-muted-foreground text-sm">
          <Trans>Couldn't check message availability.</Trans>
        </p>
        <Button
          type="button"
          variant="outline"
          tap
          pending={eligibility.isFetching}
          onClick={() => void eligibility.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  if (!eligibility.data) {
    return (
      <p className="mb-5 border border-border bg-card p-3 text-muted-foreground text-sm">
        <Trans>Messages are available only for registered Cosmo users.</Trans>
      </p>
    );
  }

  if (createShare.isSuccess) {
    return (
      <p className="mb-5 border border-primary/30 bg-card p-3 font-semibold text-primary text-sm">
        {orderLines.length > 0 ? (
          <Trans>Message or order shared.</Trans>
        ) : (
          <Trans>Message shared.</Trans>
        )}
      </p>
    );
  }

  if (orderCheckLoading) {
    return (
      <p className="mb-5 border border-border bg-card p-3 text-muted-foreground text-sm">
        <Trans>Checking order availability…</Trans>
      </p>
    );
  }

  return (
    <div className="mb-5 space-y-2">
      {orderCheckError ? (
        <div className="flex items-center justify-between gap-3 border border-border bg-card p-3">
          <p className="text-muted-foreground text-xs">
            <Trans>Couldn't check order availability.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            tap
            onClick={() => {
              if (voucher.isError) {
                void voucher.refetch();
                return;
              }
              void offeringsQuery.refetch();
            }}
            pending={voucher.isFetching || offeringsQuery.isFetching}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      <details className="border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold text-sm">
          {orderReady ? (
            <Trans>Add a message or place an order</Trans>
          ) : (
            <Trans>Add a private message</Trans>
          )}
        </summary>
        <form
          className="space-y-3 border-border border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="note">
            {(field) => (
              <Field
                label={t`Message`}
                htmlFor="send-share-note"
                error={getFieldError(field.state.meta.errors)}
              >
                <Textarea
                  id="send-share-note"
                  value={field.state.value}
                  maxLength={500}
                  placeholder={t`Optional message`}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                {orderLines.length > 0 ? (
                  <OrderNoteLength
                    message={field.state.value}
                    lines={orderLines}
                    labels={orderLabels}
                  />
                ) : null}
              </Field>
            )}
          </form.Field>

          <div className="space-y-2">
            {hasEmail ? (
              <form.Field name="email">
                {(field) => (
                  <ShareOption
                    id="send-share-email"
                    label={t`Email`}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                )}
              </form.Field>
            ) : null}
            {hasPhone ? (
              <form.Field name="phone">
                {(field) => (
                  <ShareOption
                    id="send-share-phone"
                    label={t`Phone`}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                )}
              </form.Field>
            ) : null}
            {hasLocation ? (
              <form.Field name="location">
                {(field) => (
                  <ShareOption
                    id="send-share-location"
                    label={t`Location`}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                )}
              </form.Field>
            ) : null}
          </div>

          {orderReady ? (
            <OfferingOrderPicker
              offerings={offerings}
              quantities={orderQuantities}
              onQuantitiesChange={changeOrderQuantities}
              {...orderContext}
            />
          ) : null}

          {orderFormError ? (
            <p className="text-destructive text-xs" role="alert">
              {orderFormError}
            </p>
          ) : null}

          {createShare.error ? (
            <p className="text-destructive text-xs" role="alert">
              {createShare.error instanceof Error
                ? createShare.error.message
                : t`Couldn't share this message.`}
            </p>
          ) : null}

          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const note = buildOfferingOrderNote({
                message: values.note,
                lines: orderLines,
                labels: orderLabels,
              });
              const hasContent =
                values.note.trim() !== "" ||
                orderLines.length > 0 ||
                values.email ||
                values.phone ||
                values.location;
              return (
                <Button
                  type="submit"
                  tap
                  className="w-full"
                  disabled={!hasContent || !note.ok}
                  pending={createShare.isPending}
                >
                  {createShare.isPending ? <Trans>Sharing…</Trans> : <Trans>Share</Trans>}
                </Button>
              );
            }}
          </form.Subscribe>
        </form>
      </details>
    </div>
  );
}

function OrderNoteLength({
  message,
  lines,
  labels,
}: {
  message: string;
  lines: readonly OfferingOrderLine[];
  labels: OfferingOrderLabels;
}) {
  const result = buildOfferingOrderNote({ message, lines, labels });
  return (
    <p className="text-end text-muted-foreground text-xs">
      {result.ok
        ? `${result.note.length}/${OFFERING_ORDER_NOTE_MAX_LENGTH}`
        : `>${OFFERING_ORDER_NOTE_MAX_LENGTH}`}
    </p>
  );
}

function ShareOption({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function ReceiptShell({
  embedded = false,
  icon,
  title,
  amount,
  message,
  toAddress,
  recipientLabel,
  status,
  onDone,
}: {
  embedded?: boolean;
  icon: React.ReactNode;
  title: React.ReactNode;
  amount: string | null;
  message: React.ReactNode;
  toAddress: string | null;
  recipientLabel: string | null;
  status: React.ReactNode;
  /**
   * Omitted while the transfer is still settling. The screen replaces itself
   * with the outcome the moment the chain answers, and a Done button sitting
   * there meanwhile is a way to leave before ever seeing whether it landed.
   */
  onDone?: () => void;
}) {
  return (
    <div
      className={
        embedded
          ? "flex flex-col"
          : "flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }
    >
      <div className="flex flex-col items-center text-center">
        {icon}
        <h1 className="font-heading mt-3.5 flex flex-col items-center gap-1 text-[1.75rem] font-bold leading-tight">
          <span>{title}</span>
          {amount ? <span className="text-primary">{amount}</span> : null}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
      </div>

      <div className="my-5 border border-border bg-card">
        {toAddress ? (
          <ReceiptRow label={<Trans>Recipient</Trans>}>
            <RecipientIdentityLabel
              address={toAddress}
              fallback={recipientLabel ?? undefined}
              showAddress
            />
          </ReceiptRow>
        ) : null}
        <ReceiptRow label={<Trans>Network</Trans>}>
          <span className="text-xs font-semibold">{CHAIN_INFO.name}</span>
        </ReceiptRow>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">
            <Trans>Status</Trans>
          </span>
          {status}
        </div>
      </div>

      <div className="flex-1" />

      {onDone ? (
        <Button tap className="w-full" onClick={onDone}>
          <Trans>Done</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function formatSubmittedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
