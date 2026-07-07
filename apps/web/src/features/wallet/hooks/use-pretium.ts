import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getPretiumRates,
  getPretiumTransactionsByAddress,
  triggerPretiumOnramp,
  type TriggerPretiumOnrampInput,
} from "#/features/wallet/api/pretium-client";

const PRETIUM_HISTORY_STALE_TIME_MS = 15_000;
const PRETIUM_RATES_STALE_TIME_MS = 60_000;

export const pretiumQueryKeys = {
  all: ["pretium"] as const,
  rates: () => [...pretiumQueryKeys.all, "rates"] as const,
  transactionsByAddress: (address: string | undefined) =>
    [...pretiumQueryKeys.all, "transactions", "address", address?.toLowerCase() ?? "none"] as const,
};

export function usePretiumRates(enabled = true) {
  return useQuery({
    queryKey: pretiumQueryKeys.rates(),
    queryFn: getPretiumRates,
    enabled,
    staleTime: PRETIUM_RATES_STALE_TIME_MS,
    retry: false,
  });
}

export function usePretiumTransactionsByAddress(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: pretiumQueryKeys.transactionsByAddress(address),
    queryFn: () => getPretiumTransactionsByAddress(requireAddress(address)),
    enabled: !!address,
    staleTime: PRETIUM_HISTORY_STALE_TIME_MS,
    retry: false,
  });
}

export function useTriggerPretiumOnramp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerPretiumOnrampInput) => triggerPretiumOnramp(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({
        queryKey: pretiumQueryKeys.transactionsByAddress(input.address),
      });
    },
  });
}

function requireAddress(address: `0x${string}` | undefined): `0x${string}` {
  if (!address) throw new Error("Wallet address is required.");
  return address;
}
