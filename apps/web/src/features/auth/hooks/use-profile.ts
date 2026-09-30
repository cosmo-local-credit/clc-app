import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { profileQueryOptions } from "@clc/api/features/auth/queries";
import { authClient } from "#/lib/api/auth";

/**
 * This app's profile read.
 *
 * Key and fetcher come from `@clc/api` so the console shares them; the two options
 * added here are web-only. `enabled` because a profile cannot be requested before a
 * wallet is connected, and `retry: false` because the failure that matters is a 404
 * for an address with no profile yet — replaying it just delays the signup prompt.
 *
 * A caller that renders for guests too passes `enabled: false` until there is a
 * session: a connected wallet alone is not one.
 */
export function useAuthProfile({ enabled = true }: { enabled?: boolean } = {}) {
  const { address } = useConnection();

  return useQuery({
    ...profileQueryOptions(authClient, address),
    enabled: enabled && !!address,
    retry: false,
  });
}
