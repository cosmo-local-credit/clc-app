import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { safeAppQueueUrl, type SafeCall } from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Fragment, type ReactNode } from "react";
import { RiCheckLine } from "react-icons/ri";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { Spinner } from "#/components/ui/spinner";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SAFE_APP_PREFIX } from "#/lib/safe-config";
import { type SafePendingProposal, useSafePending } from "../hooks/use-safe-pending";
import { useSafeSheet } from "../state/safe-sheet";
import {
  CallLabel,
  callGroup,
  MintAmount,
  proposalRecipients,
  proposalTitle,
} from "./safe-proposal-labels";

/**
 * Queued proposals of one Safe. A signer with a key the Safe accepts confirms
 * here; execution and rejection stay in Safe.
 */
export function SafePendingSheet() {
  const safe = useSafeSheet((state) => state.safe);
  const close = useSafeSheet((state) => state.close);
  return (
    <SheetRoot
      open={safe !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              <Trans>Multisig transactions</Trans>
            </SheetTitle>
          </SheetHeader>
          {safe ? <PendingList safe={safe} onClose={close} /> : null}
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function PendingList({ safe, onClose }: { safe: `0x${string}`; onClose: () => void }) {
  const pending = useSafePending(safe);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {pending.status === "pending" ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Trans>Loading…</Trans>
          </p>
        ) : pending.status === "error" ? (
          <p className="py-6 text-sm text-muted-foreground">
            <Trans>Proposals are unavailable here. You can still use your multisig wallet.</Trans>
          </p>
        ) : pending.proposals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Trans>No queued proposals found.</Trans>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.proposals.map((proposal) => (
              <Proposal
                key={proposal.transaction.safeTxHash}
                proposal={proposal}
                busy={pending.confirmBusy}
              />
            ))}
          </ul>
        )}
      </div>
      <SheetFooter>
        {SAFE_APP_PREFIX ? (
          <Button asChild variant="outline" tap className="w-full">
            <a
              href={safeAppQueueUrl(SAFE_APP_PREFIX, safe)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Trans>Open in Safe</Trans>
            </a>
          </Button>
        ) : null}
        <Button variant="outline" tap className="w-full" onClick={onClose}>
          <Trans>Close</Trans>
        </Button>
      </SheetFooter>
    </div>
  );
}

/** Each mint's recipient and amount, and the new owner of a handover. */
function ProposalDetails({ calls }: { calls: readonly SafeCall[] | null }) {
  const { mints, newOwners } = proposalRecipients(calls);
  if (mints.length === 0 && newOwners.length === 0) return null;
  return (
    <dl className="space-y-1.5">
      {mints.map((mint, index) => (
        <Fragment key={index}>
          <DetailRow label={<Trans>Recipient</Trans>}>
            <RecipientIdentityLabel address={mint.recipient} showAddress />
          </DetailRow>
          <DetailRow label={<Trans>Amount</Trans>}>
            <MintAmount token={mint.token} amountRaw={mint.amountRaw} />
          </DetailRow>
        </Fragment>
      ))}
      {newOwners.map((owner) => (
        <DetailRow key={owner} label={<Trans>New owner</Trans>}>
          <RecipientIdentityLabel address={owner} showAddress />
        </DetailRow>
      ))}
    </dl>
  );
}

function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end text-xs">{children}</dd>
    </div>
  );
}

function Proposal({ proposal, busy }: { proposal: SafePendingProposal; busy: boolean }) {
  const { t } = useLingui();
  const { transaction, calls, action } = proposal;
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm font-semibold">{proposalTitle(calls)}</span>
        <Badge
          size="sm"
          variant={action === "execute" || action === "executing" ? "primary" : "muted"}
        >
          {transaction.confirmations.length}/{transaction.confirmationsRequired}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans>Nonce {transaction.nonce}</Trans>
      </p>
      <ProposalDetails calls={calls} />
      {calls && calls.length > 1 ? (
        <ul className="space-y-1">
          {calls.map((call, index) => (
            <li key={index} className="flex items-baseline justify-between gap-2 text-xs">
              <CallLabel group={callGroup(call)} />
              <span dir="ltr" className="font-mono text-muted-foreground">
                {formatVoucherAddress(call.to)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {transaction.confirmations.length > 0 ? (
        <ul aria-label={t`Confirmed`} className="flex flex-wrap gap-x-3 gap-y-1">
          {transaction.confirmations.map((confirmation) => (
            <li
              key={confirmation.owner}
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <RiCheckLine className="size-3.5 shrink-0" aria-hidden="true" />
              <span dir="ltr" className="font-mono">
                {formatVoucherAddress(confirmation.owner)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {action === "executing" ? (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <Trans>Executing…</Trans>
        </p>
      ) : action === "confirm" ? (
        <Button tap pending={proposal.confirming} disabled={busy} onClick={proposal.confirm}>
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
    </li>
  );
}
