import {
  classifyOwnerCode,
  isSigner,
  safeReadAbi,
  type AssetOwnerInfo,
} from "@clc/core/features/safe/logic";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress, type Client } from "viem";
import { getBlockNumber, getCode, readContract } from "viem/actions";
import { useClient } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_OWNERSHIP_ENABLED } from "#/lib/safe-config";
import { safeClient } from "#/lib/api/safe";
import { useAssetOwner } from "./use-asset-owner";

export type { AssetOwnerInfo } from "@clc/core/features/safe/logic";

export const assetOwnerInfoKey = (owner: string) =>
  ["asset-owner-info", CHAIN_ID, owner.toLowerCase()] as const;

export const assetOwnerProjectionKey = (owner: string) =>
  ["asset-owner-projection", CHAIN_ID, owner.toLowerCase()] as const;

/**
 * Classifies an owner address. Order matters: empty code is an EOA, and so is an
 * EIP-7702 delegation (a Calibur-delegated EOA), whose execution path stays
 * untouched. Other contracts are recognized by getOwners at one block. A
 * threshold getter is optional, so partially compatible multisigs can still
 * receive an ownership handover and manage metadata.
 */
export async function readAssetOwnerInfo(
  client: Client,
  owner: `0x${string}`,
): Promise<AssetOwnerInfo> {
  const code = await getCode(client, { address: owner });
  if (classifyOwnerCode(code) === "eoa") return { kind: "eoa", owner };
  try {
    const blockNumber = await getBlockNumber(client, { cacheTime: 0 });
    const read = <TName extends "getOwners" | "getThreshold">(functionName: TName) =>
      readContract(client, { address: owner, abi: safeReadAbi, functionName, blockNumber });
    const [signers, threshold] = await Promise.all([
      read("getOwners"),
      read("getThreshold").catch(() => null),
    ]);
    if (
      !signers?.length ||
      signers.some((signer) => signer.toLowerCase() === zeroAddress) ||
      new Set(signers.map((signer) => signer.toLowerCase())).size !== signers.length
    ) {
      return { kind: "unsupported", owner };
    }
    return {
      kind: "safe",
      owner,
      signers: [...signers],
      threshold:
        threshold === null || threshold < 1n || threshold > BigInt(signers.length)
          ? null
          : Number(threshold),
    };
  } catch {
    return { kind: "unsupported", owner };
  }
}

/**
 * Who owns an asset and how it is managed. `isSigner` is judged from the
 * backend session's address, like the existing owner checks: it keeps owner
 * controls off other people's screens, and clc-core decides for real.
 *
 * With the feature off every owner reads as an EOA, so nothing here changes the
 * shipped behaviour.
 */
export function useAssetOwnerInfo(address: string, catalogOwner: string | null | undefined) {
  const owner = useAssetOwner(address, catalogOwner);
  const client = useClient({ chainId: CHAIN_ID });
  const auth = useAuthStatus();
  const ownerAddress = owner && isAddress(owner) ? owner : undefined;
  const query = useQuery({
    queryKey: assetOwnerInfoKey(ownerAddress ?? "none"),
    queryFn: async ({ signal }): Promise<AssetOwnerInfo> => {
      // The backend persists discovery and registers verified catalog owners
      // in AccountIndex. Membership comes from the same projection as writes.
      const projected = await safeClient.owner(ownerAddress!, signal);
      if (projected.kind === "safe") return projected;
      const code = await getCode(client!, { address: ownerAddress! });
      return classifyOwnerCode(code) === "eoa" ? { kind: "eoa", owner: ownerAddress! } : projected;
    },
    enabled: SAFE_OWNERSHIP_ENABLED && !!client && !!ownerAddress,
    staleTime: 30_000,
    retry: false,
  });
  const sessionAddress = auth.isAuthenticated ? auth.session?.address : undefined;
  const info: AssetOwnerInfo | undefined = query.data ?? undefined;
  const isSafeSigner =
    info?.kind === "safe" && isSigner(info.signers, sessionAddress as `0x${string}` | undefined);
  const isEoaOwner =
    !!ownerAddress &&
    !!sessionAddress &&
    ownerAddress.toLowerCase() === sessionAddress.toLowerCase() &&
    info?.kind !== "safe";
  return {
    owner: ownerAddress,
    info,
    /** True while a Safe owner is still being classified, so controls do not flash. */
    pending: SAFE_OWNERSHIP_ENABLED && !!ownerAddress && query.isPending && !!client,
    isSafeOwned: info?.kind === "safe",
    isSafeSigner,
    /** The session may manage this asset on chain: it is the EOA owner or a signer of the owner Safe. */
    canManage: isEoaOwner || isSafeSigner,
    unsupportedOwner: info?.kind === "unsupported",
  };
}

/**
 * The subset of `owners` that are multisigs listing `account` as a signer, read
 * from the backend projection that also authorizes writes. Empty while the
 * feature is off, so callers keep their account-only behaviour.
 */
export function useSafeOwnersSignedBy(
  owners: readonly string[],
  account: string | undefined,
): ReadonlySet<string> {
  const distinct = [...new Set(owners.map((owner) => owner.toLowerCase()))].filter((owner) =>
    isAddress(owner),
  );
  const results = useQueries({
    queries: distinct.map((owner) => ({
      queryKey: assetOwnerProjectionKey(owner),
      queryFn: ({ signal }: { signal: AbortSignal }) => safeClient.owner(owner, signal),
      enabled: SAFE_OWNERSHIP_ENABLED && !!account,
      staleTime: 30_000,
      retry: false,
    })),
  });
  const signed = new Set<string>();
  for (const { data } of results) {
    if (data?.kind === "safe" && isSigner(data.signers, account as `0x${string}` | undefined)) {
      signed.add(data.owner.toLowerCase());
    }
  }
  return signed;
}

/**
 * One multisig's signers and threshold from the same backend projection, or
 * undefined until it loads (and while the feature is off).
 */
export function useSafeSigners(
  safe: string,
): Extract<AssetOwnerInfo, { kind: "safe" }> | undefined {
  const query = useQuery({
    queryKey: assetOwnerProjectionKey(safe.toLowerCase()),
    queryFn: ({ signal }) => safeClient.owner(safe, signal),
    enabled: SAFE_OWNERSHIP_ENABLED && isAddress(safe),
    staleTime: 30_000,
    retry: false,
  });
  return query.data?.kind === "safe" ? query.data : undefined;
}
