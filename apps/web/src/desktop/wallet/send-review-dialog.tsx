import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { RecipientIdentityText } from "#/components/wallet/recipient-identity-label";
import { DeskKV } from "#/desktop/ui/kv";
import { FullValue } from "#/desktop/ui/full-value";
import { useReverseRecipientResolution } from "#/features/wallet/hooks/use-recipient-resolution";

/** The name currently registered for the address, else the one the sender chose. */
function RecipientName({ address, fallback }: { address: string; fallback?: string }) {
  const identity = useReverseRecipientResolution(address);
  if (identity.data) return <RecipientIdentityText identity={identity.data} />;
  const label = fallback && !fallback.toLowerCase().startsWith("0x") ? fallback : null;
  return label ? <span dir="auto">{label}</span> : null;
}

/**
 * The explicit confirmation before a payment is signed. Nothing is sent until
 * "Confirm and send". Everything the sender is verifying wraps, so no name,
 * digit or unit is cut: the amount keeps every digit and its symbol, and the
 * recipient shows the whole address with a Copy button. The body scrolls and
 * the actions stay in view on a short window.
 */
export function SendReviewDialog({
  open,
  onOpenChange,
  amount,
  symbol,
  unitValueLabel,
  recipient,
  recipientLabel,
  error,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  symbol: string;
  unitValueLabel: string | null;
  recipient: `0x${string}` | null;
  recipientLabel?: string;
  error: string | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useLingui();
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="flex max-h-[calc(100dvh-3rem)] max-w-[440px] flex-col gap-0 rounded-none border border-border bg-card p-0 shadow-none">
          <div className="shrink-0 border-border border-b px-5 py-4">
            <DialogTitle>
              <Trans>Confirm send</Trans>
            </DialogTitle>
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-5">
            <DeskKV
              rows={[
                [
                  <Trans key="label">Amount</Trans>,
                  <span key="value" className="grid gap-0.5" dir="ltr">
                    <span>
                      {amount} {symbol}
                    </span>
                    {unitValueLabel ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        {unitValueLabel}
                      </span>
                    ) : null}
                  </span>,
                ],
                [
                  <Trans key="label">Recipient</Trans>,
                  recipient ? (
                    <span key="value" className="grid min-w-0 gap-1.5 font-sans">
                      <RecipientName address={recipient} fallback={recipientLabel} />
                      <FullValue
                        value={recipient}
                        initiallyFull
                        copyLabel={t`Copy recipient address`}
                        copiedMessage={t`Address copied`}
                        failedMessage={t`Couldn't copy address`}
                      />
                    </span>
                  ) : (
                    <span key="value" className="text-muted-foreground">
                      —
                    </span>
                  ),
                ],
              ]}
            />
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="grid shrink-0 gap-2 border-border border-t p-5">
            <Button type="button" pending={isPending} onClick={() => void onConfirm()}>
              {isPending ? <Trans>Sending…</Trans> : <Trans>Confirm and send</Trans>}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
