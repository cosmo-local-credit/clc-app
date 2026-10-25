import type { SafeProposal } from "@clc/api/features/safe/client";
import { safePendingQueryOptions } from "@clc/api/features/safe/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  decodeSafeTransactionCalls,
  safeAppQueueUrl,
  safeCallName,
} from "@clc/core/features/safe/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { safeClient } from "#/lib/api/safe";
import { SAFE_APP_PREFIX, SAFE_MULTISEND_CALL_ONLY } from "#/lib/safe-config";
import { useReportWriteError } from "../hooks/use-report-write-error";
import { useSafeWrite } from "../hooks/use-safe-write";
import { useSafeSheet } from "../state/safe-sheet";

/**
 * The Safe's queued transactions: calls decoded, who has signed, and the one
 * action the viewer can take next. Closed unless something opened it through
 * `useSafeSheet`.
 */
export function SafePendingSheet() {
  const safe = useSafeSheet((state) => state.safe);
  const close = useSafeSheet((state) => state.close);
  return (
    <SheetRoot
      open={safe !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              <Trans>Safe transactions</Trans>
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
      <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4">
        {query.isPending ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            <Trans>Loading…</Trans>
          </p>
        ) : query.isError ? (
          <p className="py-6 text-center text-destructive text-sm">
            <Trans>Couldn't load Safe transactions.</Trans>
          </p>
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            <Trans>Nothing is waiting for signatures.</Trans>
          </p>
        ) : (
          transactions.map((transaction) => (
            <PendingTransaction key={transaction.safeTxHash} transaction={transaction} />
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

function PendingTransaction({ transaction }: { transaction: SafeProposal }) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const write = useSafeWrite();
  const reportError = useReportWriteError();

  const viewer = auth.isAuthenticated ? auth.session?.address.toLowerCase() : undefined;
  const signed = transaction.confirmations.some((c) => c.owner.toLowerCase() === viewer);
  const ready = transaction.confirmations.length >= transaction.confirmationsRequired;
  const isCancellation =
    transaction.to.toLowerCase() === transaction.safe.toLowerCase() && transaction.data === "0x";
  const calls = decodeSafeTransactionCalls(transaction, SAFE_MULTISEND_CALL_ONLY);
  const busy = write.execute.isPending || write.confirm.isPending || write.cancel.isPending;

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
    } catch (error) {
      reportError(error, t`The transaction failed.`);
    }
  };

  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm">
          {isCancellation ? (
            <Trans>Reject nonce {transaction.nonce}</Trans>
          ) : (
            <Trans>Nonce {transaction.nonce}</Trans>
          )}
        </p>
        <Badge size="sm" caps variant={ready ? "primary" : "muted"}>
          {transaction.confirmations.length}/{transaction.confirmationsRequired}
        </Badge>
      </div>
      {calls ? (
        <ul className="space-y-1">
          {calls.map((call, index) => (
            <li key={index} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-sm">
                {safeCallName(call.data) ?? <Trans>Unknown call</Trans>}
              </span>
              <span className="font-mono text-muted-foreground">
                {formatVoucherAddress(call.to)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-destructive text-xs">
          <Trans>This transaction can't be decoded.</Trans>
        </p>
      )}
      <ul className="space-y-0.5">
        {transaction.confirmations.map((confirmation) => (
          <li key={confirmation.owner} className="font-mono text-muted-foreground text-xs">
            {formatVoucherAddress(confirmation.owner)}
          </li>
        ))}
      </ul>
      {viewer ? (
        <div className="flex gap-2">
          {ready ? (
            <Button
              tap
              className="flex-1"
              pending={write.execute.isPending}
              disabled={busy || !calls}
              onClick={() => run(() => write.execute.mutateAsync(transaction), t`Executed.`)}
            >
              {write.execute.isPending ? (
                <Trans>Waiting for the chain…</Trans>
              ) : (
                <Trans>Execute</Trans>
              )}
            </Button>
          ) : !signed ? (
            <Button
              tap
              className="flex-1"
              pending={write.confirm.isPending}
              disabled={busy || !calls}
              onClick={() => run(() => write.confirm.mutateAsync(transaction), t`Confirmed.`)}
            >
              <Trans>Confirm</Trans>
            </Button>
          ) : null}
          {!isCancellation ? (
            <Button
              variant="outline"
              tap
              className="flex-1"
              pending={write.cancel.isPending}
              disabled={busy}
              onClick={() => run(() => write.cancel.mutateAsync(transaction), t`Rejection sent.`)}
            >
              <Trans>Reject</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
