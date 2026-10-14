import type { AdminPoolTransaction } from "@clc/api/features/admin/client";
import { findPoolSwapSettlement } from "@clc/core/features/pool-swaps/settlement";
import { useQuery } from "@tanstack/react-query";
import { getTransactionReceipt } from "viem/actions";
import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";
import { TokenAmount } from "./chain-cells";

/** The admin endpoint predates protocol fees; confirmed settlement logs fill that gap. */
export function PoolProtocolFee({ transaction }: { transaction: AdminPoolTransaction }) {
  const applies = transaction.type === "swap" && transaction.success;
  const indexed = transaction.protocolFee ?? null;
  const receipt = useQuery({
    // Share a receipt across rows when a relayed transaction contains several swaps.
    queryKey: ["clc", "admin", "swap-receipt", CHAIN_ID, transaction.txHash],
    queryFn: () =>
      getTransactionReceipt(getChainClient(), { hash: transaction.txHash as `0x${string}` }),
    enabled: applies && indexed === null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const settlement =
    receipt.data && transaction.tokenOut && transaction.amountIn && transaction.amountOut
      ? findPoolSwapSettlement(receipt.data.logs, {
          poolAddress: transaction.pool,
          tokenIn: transaction.tokenIn,
          tokenOut: transaction.tokenOut,
          amountInRaw: transaction.amountIn,
          amountOutRaw: transaction.amountOut,
        })
      : null;
  const amount =
    indexed ?? (settlement?.source === "settlement" ? settlement.breakdown.protocolFeeRaw : null);
  if (!applies) return <TokenAmount amount={null} decimals={transaction.tokenOutDecimals} />;
  if (amount === null)
    return (
      <span
        className="text-muted-foreground font-mono text-xs"
        title={
          receipt.isError
            ? "The confirmed receipt could not be loaded."
            : "This swap has no unambiguous settlement event recording its protocol fee."
        }
      >
        {receipt.isPending ? "Loading…" : "Not recorded"}
      </span>
    );
  return (
    <TokenAmount
      amount={amount}
      decimals={transaction.tokenOutDecimals}
      symbol={transaction.tokenOutSymbol}
    />
  );
}
