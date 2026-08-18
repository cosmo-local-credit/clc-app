import type { AccountToken } from "@clc/api/features/accounts/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";

import { SectionLabel } from "#/components/admin/section-heading";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import type { DataState } from "#/lib/data-state";
import { cn } from "#/lib/utils";

/**
 * A narrow list of what the account holds.
 *
 * This replaces the full-width balance table that used to sit above everything
 * else. Holdings are context for an operator looking at an account, not the
 * subject of the screen, so they get a column beside the profile and a count in
 * the header rather than the page's widest surface. Every holding is present and
 * the list scrolls; nothing is hidden behind a disclosure the operator has to
 * find.
 */
export function AccountBalancesCard({
  tokens,
  state,
}: {
  tokens: Array<AccountToken>;
  state: DataState;
}) {
  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle>
          <SectionLabel>Voucher balances</SectionLabel>
        </CardTitle>
        {state.kind === "ready" ? (
          <CardAction>
            <span className="font-data text-xs text-muted-foreground">{tokens.length}</span>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent>
        {state.kind === "pending" ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading balances">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : state.kind === "error" ? (
          <p className="text-sm text-destructive">Could not load balances</p>
        ) : state.kind === "empty" ? (
          <p className="text-sm text-muted-foreground">No balances</p>
        ) : (
          <>
            {state.kind === "stale" ? (
              <p className="mb-3 text-xs text-muted-foreground">Showing the last known balances</p>
            ) : null}
            {/* Focusable and named so the list can be scrolled from the keyboard:
                a scroll container that only answers to a mouse wheel strands
                anyone tabbing through the page. */}
            <ul
              tabIndex={0}
              aria-label="Voucher balances"
              // Takes whatever height the band's tallest card leaves, rather than a
              // fixed track: the three cards then share one top and one bottom
              // edge whether the account holds two vouchers or twenty, and the
              // overflow scrolls inside the card instead of stretching the page.
              className={cn(
                "flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto",
                "outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-start justify-between gap-3 py-2 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{token.tokenName}</div>
                    <div className="font-data text-xs text-muted-foreground">
                      {formatVoucherAddress(token.tokenAddress as `0x${string}`)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-data text-sm">
                    {formatTokenAmount(token.balance, token.tokenDecimals)}
                    <div className="font-mono text-xs text-muted-foreground">
                      {token.tokenSymbol}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
