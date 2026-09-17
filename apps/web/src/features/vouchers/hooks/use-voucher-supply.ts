import { giftableTokenTotalSupplyAbi } from "@clc/core/features/vouchers/logic";
import { useQuery } from "@tanstack/react-query";
import { readContract } from "viem/actions";
import { useClient } from "wagmi";

const SUPPLY_POLL_MS = 2_000;

export function useVoucherSupply(address: `0x${string}` | undefined) {
  const client = useClient();

  return useQuery({
    queryKey: ["vouchers", "total-supply", client?.uid ?? "none", address ?? "none"],
    queryFn: async () => {
      if (!client || !address) throw new Error("Voucher supply cannot be read yet.");
      const supply = await readContract(client, {
        address,
        abi: giftableTokenTotalSupplyAbi,
        functionName: "totalSupply",
      });
      return supply.toString();
    },
    enabled: Boolean(client && address),
    // The transport already tries every configured RPC. One query retry covers
    // a transient all-provider failure without multiplying the worst-case wait.
    retry: 1,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => (query.state.data === "0" ? SUPPLY_POLL_MS : false),
  });
}
