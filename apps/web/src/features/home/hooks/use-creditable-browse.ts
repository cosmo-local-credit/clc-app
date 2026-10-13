import { parsePoolCreditable } from "#/lib/navigation/pool-search";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useCreditablePools } from "#/features/pools/hooks/use-creditable-pools";
import { CHAIN_ID } from "#/lib/chain";

export function useCreditableBrowse(
  value: boolean | string | readonly (boolean | string)[] | undefined,
) {
  const auth = useAuthStatus();
  const parsed = parsePoolCreditable(value);
  const enabled = parsed.ok && parsed.enabled === true;
  const verification = useCreditablePools(
    enabled && auth.isAuthenticated ? auth.address : undefined,
  );
  const poolRefs =
    enabled && auth.isAuthenticated && verification.status === "ready"
      ? verification.pools.map((pool) => ({
          chainId: pool.chainId ?? CHAIN_ID,
          address: pool.address,
        }))
      : undefined;

  return {
    auth,
    parsed,
    enabled,
    verification,
    poolRefs,
    blocksResults:
      !parsed.ok ||
      (enabled &&
        (!auth.isAuthenticated || verification.status !== "ready" || poolRefs?.length === 0)),
  };
}
