import { buildSendSharePermission, sendShareFormSchema } from "@clc/core/features/wallet/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field } from "#/components/ui/field";
import { Textarea } from "#/components/ui/textarea";
import {
  EllipsizedAddress,
  FailureCross,
  PendingClock,
  SignedAmount,
  StatusPill,
  SuccessCheck,
} from "#/components/wallet";
import { useOtxTracking } from "#/features/auth/hooks/use-otx-tracking";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  useCreateSendShare,
  useSendShareEligibility,
} from "#/features/wallet/hooks/use-send-share";
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

function CopyableMono({
  value,
  label,
  onCopy,
}: {
  value: string;
  label: string;
  onCopy: (value: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-1.5 bg-card text-end"
      aria-label={label}
      onClick={() => onCopy(value)}
    >
      <EllipsizedAddress address={value} />
      <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
        <RiFileCopyLine className="size-3" aria-hidden="true" />
      </span>
    </button>
  );
}

export function SendReceiptPage({
  trackingId,
  recipient,
  amount,
  symbol,
  returnPool,
}: {
  trackingId?: string;
  recipient?: string;
  amount?: string;
  symbol?: string;
  /**
   * The pool a Deposit shortcut started this send from.
   *
   * Carried as an address rather than a path so this screen can only ever exit
   * to a pool, and resolved here rather than with `router.history.back()`: the
   * flow pushed two entries between the pool and this receipt, and one of them
   * is a form that Back must not reopen behind a signed transaction.
   */
  returnPool?: string;
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const tracking = useOtxTracking(trackingId ?? null, {
    queryKey: "send-relay-track",
    queryFn: async (nextTrackingId) => (await relayerClient.trackRelay(nextTrackingId)).result,
  });
  const toAddress = recipient ?? null;
  const amountLabel = amount && symbol ? `${amount} ${symbol}` : null;
  const outcome = tracking.outcome;
  const exitReceipt = () => {
    if (returnPool) {
      void navigate({
        to: "/pools/$poolAddress",
        params: { poolAddress: returnPool },
        replace: true,
      });
      return;
    }
    void navigate({ to: "/", search: { tab: "wallet" }, replace: true });
  };

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
        icon={<PendingClock />}
        title={<Trans>Sending</Trans>}
        amount={amountLabel}
        message={<Trans>Waiting for on-chain confirmation</Trans>}
        toAddress={toAddress}
        status={<StatusPill tone="pending" label={<Trans>Pending</Trans>} />}
      />
    );
  }

  if (outcome.kind === "error") {
    return (
      <ReceiptShell
        icon={<FailureCross />}
        title={<Trans>Reverted</Trans>}
        amount={amountLabel}
        message={outcome.error}
        toAddress={toAddress}
        status={<StatusPill tone="error" label={<Trans>Reverted</Trans>} />}
        onDone={exitReceipt}
      />
    );
  }

  const txHash = outcome.otx.txHash || null;
  const explorerUrl = txHash ? explorerTxUrl(CHAIN_INFO, txHash) : null;
  const submittedAt = outcome.otx.createdAt
    ? formatSubmittedAt(outcome.otx.createdAt, i18n.locales?.[0] ?? i18n.locale)
    : null;

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <SuccessCheck />
        <h1 className="font-heading mt-3.5 text-[1.75rem] font-bold leading-tight">
          <Trans>Sent</Trans>
        </h1>
      </div>

      <div className="my-5 border border-border bg-card">
        {amountLabel ? (
          <ReceiptRow label={t`Amount`}>
            <SignedAmount direction="out" amount={amountLabel} />
          </ReceiptRow>
        ) : null}
        {toAddress ? (
          <ReceiptRow label={t`To`}>
            <EllipsizedAddress address={toAddress} />
          </ReceiptRow>
        ) : null}
        {txHash ? (
          <ReceiptRow label={t`Transaction`}>
            <CopyableMono value={txHash} label={t`Copy transaction hash`} onCopy={copy} />
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

      {txHash && toAddress ? <SendSharePanel txHash={txHash} recipientAddress={toAddress} /> : null}

      <div className="flex-1" />

      <div className="flex gap-3">
        <Button className="h-11 flex-1" onClick={exitReceipt}>
          {returnPool ? t`Back to pool` : t`Done`}
        </Button>
        {explorerUrl ? (
          <Button asChild className="h-11 flex-1" variant="outline">
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
}: {
  txHash: string;
  recipientAddress: string;
}) {
  const { t } = useLingui();
  const eligibility = useSendShareEligibility(recipientAddress);
  const profile = useAuthProfile();
  const createShare = useCreateSendShare(txHash);
  const hasEmail = !!profile.data?.email && !profile.data.email.endsWith("@clc.local");
  const hasPhone = !!profile.data?.phone;
  const hasLocation =
    !!profile.data?.locationName && profile.data.geoLat != null && profile.data.geoLng != null;
  const form = useForm({
    defaultValues: {
      note: "",
      email: false,
      phone: false,
      location: false,
    },
    validators: { onSubmit: sendShareFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = sendShareFormSchema.parse(value);
      const permission = buildSendSharePermission(parsed);
      try {
        await createShare.mutateAsync({
          permission,
          ...(parsed.note ? { note: parsed.note } : {}),
        });
      } catch {
        return;
      }
    },
  });

  if (eligibility.isPending) {
    return (
      <p className="mb-5 border border-border bg-card p-3 text-muted-foreground text-xs">
        <Trans>Checking message availability…</Trans>
      </p>
    );
  }

  if (eligibility.isError) {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 border border-border bg-card p-3">
        <p className="text-muted-foreground text-xs">
          <Trans>Couldn't check message availability.</Trans>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="bg-card"
          onClick={() => eligibility.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  if (!eligibility.data) {
    return (
      <p className="mb-5 border border-border bg-card p-3 text-muted-foreground text-xs">
        <Trans>Messages are available only for registered Cosmo users.</Trans>
      </p>
    );
  }

  if (createShare.isSuccess) {
    return (
      <p className="mb-5 border border-primary/30 bg-card p-3 font-semibold text-primary text-sm">
        <Trans>Message shared.</Trans>
      </p>
    );
  }

  return (
    <details className="mb-5 border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold text-sm">
        <Trans>Add a private message</Trans>
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

        {createShare.error ? (
          <p className="text-destructive text-xs" role="alert">
            {createShare.error instanceof Error
              ? createShare.error.message
              : t`Couldn't share this message.`}
          </p>
        ) : null}

        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const hasContent =
              values.note.trim() !== "" || values.email || values.phone || values.location;
            return (
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={!hasContent || createShare.isPending}
              >
                {createShare.isPending ? <Trans>Sharing…</Trans> : <Trans>Share</Trans>}
              </Button>
            );
          }}
        </form.Subscribe>
      </form>
    </details>
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
  icon,
  title,
  amount,
  message,
  toAddress,
  status,
  onDone,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  amount: string | null;
  message: React.ReactNode;
  toAddress: string | null;
  status: React.ReactNode;
  /**
   * Omitted while the transfer is still settling. The screen replaces itself
   * with the outcome the moment the chain answers, and a Done button sitting
   * there meanwhile is a way to leave before ever seeing whether it landed.
   */
  onDone?: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
          <ReceiptRow label={<Trans>To</Trans>}>
            <EllipsizedAddress address={toAddress} />
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
        <Button className="h-11 w-full" onClick={onDone}>
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
