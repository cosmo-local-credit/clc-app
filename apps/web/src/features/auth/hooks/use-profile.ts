import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { getProfile } from "#/features/auth/api/client";

export const authProfileQueryKeys = {
  all: ["auth", "profile"] as const,
  current: (address: string | undefined) =>
    [...authProfileQueryKeys.all, address?.toLowerCase() ?? "none"] as const,
};

export function useAuthProfile() {
  const { address } = useAccount();

  return useQuery({
    queryKey: authProfileQueryKeys.current(address),
    queryFn: getProfile,
    enabled: !!address,
    staleTime: 60_000,
    retry: false,
  });
}
