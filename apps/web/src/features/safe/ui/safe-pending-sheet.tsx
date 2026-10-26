import type { SafeProposal } from "@clc/api/features/safe/client";
import { safePendingQueryOptions } from "@clc/api/features/safe/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  decodeSafeTransactionCalls,
  safeAppQueueUrl,
  safeCallName,
} from "@clc/core/features/safe/logic";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
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
import { safeClient } from "#/lib/api/safe";
import { SAFE_APP_PREFIX, SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { useSafeSheet } from "../state/safe-sheet";

/** Read-only proposals; confirmation, execution and rejection belong to Safe. */
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-4 pb-3 text-sm text-muted-foreground">
        <Trans>
          Confirm and execute transactions in your multisig wallet. Queueing here is optional.
        </Trans>
      </p>
      <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4">
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
          transactions.map((transaction) => (
            <Proposal key={transaction.safeTxHash} transaction={transaction} />
          ))
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

function Proposal({ transaction }: { transaction: SafeProposal }) {
  const calls = decodeSafeTransactionCalls(transaction, SAFE_MULTISEND_CALL_ONLY);
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          <Trans>Nonce {transaction.nonce}</Trans>
        </p>
        <Badge size="sm" caps variant="muted">
          {transaction.confirmations.length}/{transaction.confirmationsRequired}
        </Badge>
      </div>
      {calls ? (
        <ul className="space-y-1">
          {calls.map((call, index) => (
            <li key={index} className="flex items-baseline justify-between gap-2 text-xs">
              <span>{safeCallName(call.data) ?? <Trans>Unknown call</Trans>}</span>
              <span className="font-mono text-muted-foreground">
                {formatVoucherAddress(call.to)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans>Review this transaction in your multisig wallet.</Trans>
        </p>
      )}
      <ul className="space-y-0.5">
        {transaction.confirmations.map((confirmation) => (
          <li key={confirmation.owner} className="font-mono text-xs text-muted-foreground">
            {formatVoucherAddress(confirmation.owner)}
          </li>
        ))}
      </ul>
    </div>
  );
}
