import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { getProfile } from "@clc/api/features/auth/client";

export const authProfileQueryKeys = {
  all: ["auth", "profile"] as const,
  current: (address: string | undefined) =>
    [...authProfileQueryKeys.all, address?.toLowerCase() ?? "none"] as const,
};

export function useAuthProfile() {
  const { address } = useConnection();

  return useQuery({
    queryKey: authProfileQueryKeys.current(address),
    queryFn: getProfile,
    enabled: !!address,
    staleTime: 60_000,
    retry: false,
  });
}
