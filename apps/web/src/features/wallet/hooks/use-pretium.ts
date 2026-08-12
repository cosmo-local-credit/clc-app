import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreatePretiumLinkInput,
  TriggerPretiumOnrampInput,
} from "@clc/api/features/pretium/client";
import { clcApi } from "#/lib/api";

const PRETIUM_RATES_STALE_TIME_MS = 60_000;

// Mirror the wallet account freshness (use-account-balances.ts): onramp status
// confirms upstream within seconds via the Pretium status poller, so history
// should feel near-realtime while the user is on the Cash page, without
// polling in the background on mobile. See docs/TANSTACK_QUERY.md.
const pretiumHistoryFreshness = {
  staleTime: 4_000,
  refetchInterval: 5_000,
  refetchIntervalInBackground: false,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
  retry: false,
} as const;

export const pretiumQueryKeys = {
  all: ["pretium"] as const,
  rates: () => [...pretiumQueryKeys.all, "rates"] as const,
  transactionsByAddress: (address: string | undefined) =>
    [...pretiumQueryKeys.all, "transactions", "address", address?.toLowerCase() ?? "none"] as const,
  linkByAddress: (address: string | undefined) =>
    [...pretiumQueryKeys.all, "link", "address", address?.toLowerCase() ?? "none"] as const,
};

export function usePretiumRates(enabled = true) {
  return useQuery({
    queryKey: pretiumQueryKeys.rates(),
    queryFn: () => clcApi.pretium.getPretiumRates(),
    enabled,
    staleTime: PRETIUM_RATES_STALE_TIME_MS,
    retry: false,
  });
}

export function usePretiumTransactionsByAddress(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: pretiumQueryKeys.transactionsByAddress(address),
    queryFn: () => clcApi.pretium.getPretiumTransactionsByAddress(requireAddress(address)),
    enabled: !!address,
    ...pretiumHistoryFreshness,
  });
}

export function usePretiumLinkByAddress(address: `0x${string}` | undefined, enabled: boolean) {
  return useQuery({
    queryKey: pretiumQueryKeys.linkByAddress(address),
    queryFn: () => clcApi.pretium.getPretiumLinkByAddress(requireAddress(address)),
    enabled: enabled && !!address,
    // Always re-check when the sheet opens so a profile phone change is caught.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useCreatePretiumLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePretiumLinkInput) => clcApi.pretium.createPretiumLink(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({
        queryKey: pretiumQueryKeys.linkByAddress(input.publicKey),
      });
    },
  });
}

export function useTriggerPretiumOnramp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerPretiumOnrampInput) => clcApi.pretium.triggerPretiumOnramp(input),
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
