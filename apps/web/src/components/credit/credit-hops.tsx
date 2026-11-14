import type { CreditReach } from "@clc/api/features/credit-router/client";
import { creditReachQueryOptions } from "@clc/api/features/credit-router/queries";
import { Plural, Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";

import { Badge } from "#/components/ui/badge";
import { creditRouterClient } from "#/lib/api/credit-router";

/** The fewest swaps to each voucher and pool the wallet reaches, by lower-case address. */
type CreditHopsIndex = {
  vouchers: ReadonlyMap<string, number>;
  pools: ReadonlyMap<string, number>;
};

const CreditHopsContext = createContext<CreditHopsIndex | null>(null);

function indexReach(reach: CreditReach): CreditHopsIndex {
  return {
    vouchers: new Map(reach.vouchers.map((entry) => [entry.address.toLowerCase(), entry.minHops])),
    pools: new Map(reach.pools.map((entry) => [entry.address.toLowerCase(), entry.minHops])),
  };
}

/**
 * Reads the signed-in wallet's reach once, whatever the Credit filter says, so
 * voucher, offering and pool rows can say how many swaps away each one is. A
 * guest, an unavailable router or any failure leaves every count absent; it
 * never holds a page back.
 */
export function CreditHopsProvider({
  wallet,
  children,
}: {
  /** The session wallet; absent for a guest. */
  wallet: string | undefined;
  children: ReactNode;
}) {
  const reach = useQuery({
    ...creditReachQueryOptions(creditRouterClient, wallet ?? ""),
    select: indexReach,
  });
  const value = reach.isError ? null : (reach.data ?? null);
  return <CreditHopsContext.Provider value={value}>{children}</CreditHopsContext.Provider>;
}

/**
 * How far the wallet is from a voucher, or a pool: 0 for a voucher it already
 * holds, else the fewest swaps. Undefined when the router names no route, or
 * for a guest.
 */
function useCreditHops(kind: "voucher" | "pool", address: string | null | undefined) {
  const hops = useContext(CreditHopsContext);
  if (!hops || !address) return undefined;
  return (kind === "pool" ? hops.pools : hops.vouchers).get(address.toLowerCase());
}

/**
 * "In your wallet", "1 swap" or "3 swaps" for a voucher or pool row; nothing
 * when the router names no route. A pool is never held, so it reads only swaps.
 */
export function CreditHopsBadge({
  kind,
  address,
  className,
}: {
  kind: "voucher" | "pool";
  address: string | null | undefined;
  className?: string;
}) {
  const hops = useCreditHops(kind, address);
  if (hops === undefined || (kind === "pool" && hops === 0)) return null;
  return (
    <Badge size="sm" variant="muted" className={className}>
      {hops === 0 ? (
        <Trans>In your wallet</Trans>
      ) : (
        <Plural value={hops} one="# swap" other="# swaps" />
      )}
    </Badge>
  );
}
