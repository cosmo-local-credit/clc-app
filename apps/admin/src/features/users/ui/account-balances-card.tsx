import type { AccountToken } from "@clc/api/features/accounts/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";

import { SectionLabel } from "#/components/admin/section-heading";
import { Skeleton } from "#/components/ui/skeleton";
import type { DataState } from "#/lib/data-state";
import { cn } from "#/lib/utils";

/**
 * A narrow list of what the account holds.
 *
 * Holdings are context for an operator looking at an account, not the subject of
 * the screen, so they get a column beside the record and a count in the heading
 * rather than the page's widest surface. Every holding is present and the list
 * scrolls; nothing is hidden behind a disclosure the operator has to find.
 *
 * Built as a bordered `section` with a `SectionLabel`, matching the pool screen's
 * charts rather than the `Card` this used to be: the whole right-hand column is
 * then one family of flat outlined panels, and a card's ring beside a panel's
 * border reads as two different kinds of surface for no reason.
 */
export function AccountBalancesCard({
  tokens,
  state,
}: {
  tokens: Array<AccountToken>;
  state: DataState;
}) {
  return (
    <section
      aria-label="Voucher balances"
      className="border-border bg-card flex min-h-0 flex-col border p-3"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <SectionLabel>Voucher balances</SectionLabel>
        {state.kind === "ready" || state.kind === "stale" ? (
          <span className="font-data text-muted-foreground text-xs">{tokens.length}</span>
        ) : null}
      </div>

      {state.kind === "pending" ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading balances">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : state.kind === "error" ? (
        <p className="text-muted-foreground py-8 text-sm">Could not load balances.</p>
      ) : state.kind === "empty" ? (
        <p className="text-muted-foreground py-8 text-sm">This address holds no voucher.</p>
      ) : (
        <>
          {state.kind === "stale" ? (
            <p className="text-muted-foreground mb-2 text-xs">Showing the last known balances.</p>
          ) : null}
          {/* Focusable so the list can be scrolled from the keyboard: a scroll
              container that only answers to a mouse wheel strands anyone tabbing
              through the page. It needs no label of its own — the section around
              it is the named region.

              The cap only applies below the widest breakpoint. At xl the grid row
              bounds this panel — it is as tall as the record beside it and the
              list fills whatever that leaves — but once the row folds to one
              column there is nothing to bound it, and an account holding thirty
              vouchers would push the records tab off the screen. */}
          <ul
            tabIndex={0}
            className={cn(
              "divide-border flex max-h-80 min-h-0 flex-1 flex-col divide-y overflow-y-auto xl:max-h-none",
              "focus-visible:ring-ring outline-none focus-visible:ring-1",
            )}
          >
            {tokens.map((token) => (
              <li key={token.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{token.tokenName}</div>
                  <div className="font-data text-muted-foreground text-xs">
                    {formatVoucherAddress(token.tokenAddress as `0x${string}`)}
                  </div>
                </div>
                <div className="font-data shrink-0 text-right text-sm">
                  {formatTokenAmount(token.balance, token.tokenDecimals)}
                  <div className="text-muted-foreground font-mono text-xs">{token.tokenSymbol}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
