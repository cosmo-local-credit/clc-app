import { adminStatsQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { clcApi } from "#/lib/api";
import { relayerClient } from "#/lib/relayer-config";
import { type TimeRangeValue, timeRangeToApiParams } from "#/lib/time-range";
import { fetchRelayerGas } from "./relayer-gas";

const DASHBOARD_STALE_TIME = 30_000;

const dashboardKeys = {
  relayerGas: ["clc", "admin", "dashboard", "relayer-gas"] as const,
} as const;

export function useDashboardStats(range: TimeRangeValue) {
  const params = timeRangeToApiParams(range);
  return useQuery({
    ...adminStatsQueryOptions(clcApi.admin, params),
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useRelayerGas() {
  return useQuery({
    queryKey: dashboardKeys.relayerGas,
    staleTime: DASHBOARD_STALE_TIME,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => fetchRelayerGas(relayerClient, clcApi.accounts, signal),
  });
}
