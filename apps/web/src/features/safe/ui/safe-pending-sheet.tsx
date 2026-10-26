import type { SafeProposal } from "@clc/api/features/safe/client";
import { safePendingQueryOptions } from "@clc/api/features/safe/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  decodeSafeTransactionCalls,
  safeAppQueueUrl,
  safeCallName,
  safeProposalAction,
  type SafeCall,
} from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { RiCheckLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { safeClient } from "#/lib/api/safe";
import { SAFE_APP_PREFIX, SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { useSafeConfirm } from "../hooks/use-safe-confirm";
import { useSafeSheet } from "../state/safe-sheet";

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
  const query = useQuery(safePendingQueryOptions(safeClient, safe));
  const transactions = query.data ?? [];
  const auth = useAuthStatus();
  const { address, connector } = useConnection();
  const viewer = auth.isAuthenticated
    ? (auth.session?.address as `0x${string}` | undefined)
    : undefined;
  const isSigner = useSafeOwnersSignedBy([safe], viewer).has(safe.toLowerCase());
  // A passkey cannot produce a signature the Safe accepts, and the connected
  // wallet must be the session's, or the backend would refuse the signature.
  const canSign =
    isSigner &&
    connector?.id !== CALIBUR_WEBAUTHN_CONNECTOR_ID &&
    !!address &&
    address.toLowerCase() === viewer?.toLowerCase();
  const confirm = useSafeConfirm();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {query.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Trans>Loading…</Trans>
          </p>
        ) : query.isError ? (
          <p className="py-6 text-sm text-muted-foreground">
            <Trans>Proposals are unavailable here. You can still use your multisig wallet.</Trans>
          </p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Trans>No queued proposals found.</Trans>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((transaction) => (
              <Proposal
                key={transaction.safeTxHash}
                transaction={transaction}
                viewer={viewer}
                canSign={canSign}
                confirming={confirm.isPending}
                confirmingThis={
                  confirm.isPending && confirm.variables?.safeTxHash === transaction.safeTxHash
                }
                onConfirm={() =>
                  confirm.mutate(transaction, {
                    onError: (error) => {
                      toast.error(error.message);
                    },
                  })
                }
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

/** The owner action a call performs, in the words its own control uses. */
function callGroup(call: SafeCall): string {
  return safeCallName(call.data) ?? "unknown";
}

function CallLabel({ group }: { group: string }) {
  switch (group) {
    case "mintTo":
      return <Trans>Create vouchers</Trans>;
    case "transferOwnership":
      return <Trans>Transfer ownership</Trans>;
    case "withdrawLiquidity":
      return <Trans>Withdraw liquidity</Trans>;
    case "withdraw":
      return <Trans>Withdraw fees</Trans>;
    case "setDefaultFee":
    case "setFeeAddress":
      return <Trans>Fee % and recipient</Trans>;
    case "add":
      return <Trans>Approve voucher</Trans>;
    case "setLimitFor":
    case "setPriceIndexValue":
    case "setOracle":
      return <Trans>Manage voucher</Trans>;
    case "remove":
      return <Trans>Remove</Trans>;
    case "unknown":
      return <Trans>Unknown call</Trans>;
    default:
      return <span className="font-mono">{group}</span>;
  }
}

/** Calls that share a control's label, so a batch reads as one action each. */
function labelKey(group: string): string {
  if (group === "setDefaultFee" || group === "setFeeAddress") return "fee";
  if (group === "setLimitFor" || group === "setPriceIndexValue" || group === "setOracle") {
    return "manage";
  }
  return group;
}

function proposalTitle(calls: readonly SafeCall[] | null): ReactNode {
  if (!calls) return <Trans>Unknown call</Trans>;
  const byLabel = new Map<string, string>();
  for (const call of calls) byLabel.set(labelKey(callGroup(call)), callGroup(call));
  // Approving a voucher already sets its limit and rate.
  if (byLabel.has("add")) byLabel.delete("manage");
  return [...byLabel.values()].map((group, index) => (
    <Fragment key={group}>
      {index > 0 ? ", " : null}
      <CallLabel group={group} />
    </Fragment>
  ));
}

function Proposal({
  transaction,
  viewer,
  canSign,
  confirming,
  confirmingThis,
  onConfirm,
}: {
  transaction: SafeProposal;
  viewer: `0x${string}` | undefined;
  canSign: boolean;
  confirming: boolean;
  confirmingThis: boolean;
  onConfirm: () => void;
}) {
  const { t } = useLingui();
  const calls = decodeSafeTransactionCalls(transaction, SAFE_MULTISEND_CALL_ONLY);
  const action = safeProposalAction({
    confirmations: transaction.confirmations,
    confirmationsRequired: transaction.confirmationsRequired,
    calls,
    viewer,
    canSign,
  });
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm font-semibold">{proposalTitle(calls)}</span>
        <Badge size="sm" variant={action === "execute" ? "primary" : "muted"}>
          {transaction.confirmations.length}/{transaction.confirmationsRequired}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans>Nonce {transaction.nonce}</Trans>
      </p>
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
      {action === "confirm" ? (
        <Button tap pending={confirmingThis} disabled={confirming} onClick={onConfirm}>
          {confirmingThis ? <Trans>Confirming</Trans> : <Trans>Confirm</Trans>}
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
