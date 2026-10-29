import { Dialog } from "@base-ui/react/dialog";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { safeAppQueueUrl } from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiCheckLine, RiCloseLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { Spinner } from "#/components/ui/spinner";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { DeskKV } from "#/desktop/ui/kv";
import { DeskRow, DeskRowList } from "#/desktop/ui/page";
import { useSafeSigners } from "#/features/ownership/hooks/use-asset-owner-info";
import { type SafePendingProposal, useSafePending } from "#/features/safe/hooks/use-safe-pending";
import { useSafeSheet } from "#/features/safe/state/safe-sheet";
import {
  CallLabel,
  callGroup,
  MintAmount,
  proposalRecipients,
  proposalTitle,
} from "#/features/safe/ui/safe-proposal-labels";
import { SAFE_APP_PREFIX } from "#/lib/safe-config";

/**
 * The Safe's queued proposals as a 380px inspector on the right, under the
 * top bar. Opened from anywhere through `useSafeSheet`, like the phone sheet.
 */
export function SafePendingDesk() {
  const { t } = useLingui();
  const safe = useSafeSheet((state) => state.safe);
  const close = useSafeSheet((state) => state.close);
  return (
    <Dialog.Root
      open={safe !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-x-0 top-14 bottom-0 z-40 bg-black/20 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed end-0 top-14 bottom-0 z-50 flex w-[380px] flex-col border-border border-s bg-card transition-transform duration-150 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full rtl:data-[ending-style]:-translate-x-full rtl:data-[starting-style]:-translate-x-full">
          <div className="flex h-13 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
            <Dialog.Title className="min-w-0 truncate font-heading text-base font-semibold">
              <Trans>Multisig transactions</Trans>
            </Dialog.Title>
            <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={close}>
              <RiCloseLine aria-hidden="true" />
            </Button>
          </div>
          {safe ? <PendingBody safe={safe} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PendingBody({ safe }: { safe: `0x${string}` }) {
  const pending = useSafePending(safe);
  const signers = useSafeSigners(safe);
  return (
    <>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
        {pending.status === "pending" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            <Trans>Loading…</Trans>
          </p>
        ) : pending.status === "error" ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Proposals are unavailable here. You can still use your multisig wallet.</Trans>
          </p>
        ) : pending.proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans>No queued proposals found.</Trans>
          </p>
        ) : (
          pending.proposals.map((proposal) => (
            <Proposal
              key={proposal.transaction.safeTxHash}
              proposal={proposal}
              busy={pending.confirmBusy}
              signers={signers?.signers}
            />
          ))
        )}
      </div>
      {SAFE_APP_PREFIX ? (
        <div className="shrink-0 border-border border-t p-4">
          <Button asChild variant="outline" className="w-full">
            <a
              href={safeAppQueueUrl(SAFE_APP_PREFIX, safe)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Trans>Open in Safe</Trans>
            </a>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Proposal({
  proposal,
  busy,
  signers,
}: {
  proposal: SafePendingProposal;
  busy: boolean;
  signers: readonly `0x${string}`[] | undefined;
}) {
  const { transaction, calls, action } = proposal;
  const { mints, newOwners } = proposalRecipients(calls);
  const confirmed = new Set(transaction.confirmations.map((c) => c.owner.toLowerCase()));
  // Every signer with their state when the Safe's signers are known; otherwise
  // only the ones that have confirmed.
  const signerRows = signers ?? transaction.confirmations.map((c) => c.owner);
  const rows: [ReactNode, ReactNode][] = [];
  for (const mint of mints) {
    // A signer checks who is being paid, so the address is shown in full.
    rows.push([
      <Trans>Recipient</Trans>,
      <RecipientIdentityLabel
        address={mint.recipient}
        showAddress
        className="items-start text-start"
      />,
    ]);
    rows.push([
      <Trans>Amount</Trans>,
      <MintAmount token={mint.token} amountRaw={mint.amountRaw} />,
    ]);
  }
  for (const owner of newOwners) {
    rows.push([
      <Trans>New owner</Trans>,
      <RecipientIdentityLabel address={owner} showAddress className="items-start text-start" />,
    ]);
  }
  if (calls && calls.length > 1) {
    for (const call of calls) {
      rows.push([
        <CallLabel group={callGroup(call)} />,
        <span dir="ltr" className="text-muted-foreground">
          {formatVoucherAddress(call.to)}
        </span>,
      ]);
    }
  }

  return (
    <section className="grid gap-3 border-border border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{proposalTitle(calls)}</h3>
          <p className="text-xs text-muted-foreground">
            <Trans>Nonce {transaction.nonce}</Trans>
          </p>
        </div>
        <Badge
          size="sm"
          variant={action === "execute" || action === "executing" ? "primary" : "muted"}
          className="shrink-0 font-mono"
        >
          {transaction.confirmations.length}/{transaction.confirmationsRequired}
        </Badge>
      </div>
      {rows.length > 0 ? <DeskKV rows={rows} labelWidth="104px" /> : null}
      {signerRows.length > 0 ? (
        <div className="grid gap-2">
          <SectionHeading variant="group" as="h4">
            <Trans>Signers</Trans>
          </SectionHeading>
          <DeskRowList>
            {signerRows.map((owner) => {
              const done = confirmed.has(owner.toLowerCase());
              return (
                <DeskRow
                  key={owner}
                  className="min-h-11 py-2"
                  lead={
                    <span
                      aria-hidden="true"
                      className={
                        done
                          ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          : "size-5 shrink-0 rounded-full border border-border"
                      }
                    >
                      {done ? <RiCheckLine className="size-3.5" /> : null}
                    </span>
                  }
                  title={
                    <span dir="ltr" className="font-mono text-xs">
                      {formatVoucherAddress(owner)}
                    </span>
                  }
                  trail={
                    <Badge size="sm" variant={done ? "primary" : "muted"} caps>
                      {done ? <Trans>Confirmed</Trans> : <Trans>Pending</Trans>}
                    </Badge>
                  }
                />
              );
            })}
          </DeskRowList>
        </div>
      ) : null}
      {action === "executing" ? (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <Trans>Executing…</Trans>
        </p>
      ) : action === "confirm" ? (
        <Button
          className="w-full"
          pending={proposal.confirming}
          disabled={busy}
          onClick={proposal.confirm}
        >
          {proposal.confirming ? <Trans>Confirming</Trans> : <Trans>Confirm</Trans>}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {action === "confirmed" ? (
            <Trans>You confirmed</Trans>
          ) : action === "execute" ? (
            <Trans>Execute it in Safe.</Trans>
          ) : (
            <Trans>Review this transaction in your multisig wallet.</Trans>
          )}
        </p>
      )}
    </section>
  );
}
