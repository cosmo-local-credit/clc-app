import {
  classifyOwnerCode,
  isSigner,
  isSupportedSafeVersion,
  safeReadAbi,
} from "@clc/core/features/safe/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Client } from "viem";
import { getBlockNumber, getCode, readContract } from "viem/actions";
import { useClient } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_OWNERSHIP_ENABLED } from "#/lib/safe-config";
import { useAssetOwner } from "./use-asset-owner";

export type AssetOwnerInfo =
  | { kind: "eoa"; owner: `0x${string}` }
  | {
      kind: "safe";
      owner: `0x${string}`;
      signers: readonly `0x${string}`[];
      threshold: number;
    }
  | { kind: "unsupported"; owner: `0x${string}` };

export const assetOwnerInfoKey = (owner: string) =>
  ["asset-owner-info", CHAIN_ID, owner.toLowerCase()] as const;

/**
 * Classifies an owner address. Order matters: empty code is an EOA, and so is an
 * EIP-7702 delegation (a Calibur-delegated EOA), whose execution path stays
 * untouched. Only other contract code is probed as a Safe, at one block so the
 * version, signers and threshold describe the same state; a contract that fails
 * the probe, or runs an unsupported version, is `unsupported`.
 */
export async function readAssetOwnerInfo(
  client: Client,
  owner: `0x${string}`,
): Promise<AssetOwnerInfo> {
  const code = await getCode(client, { address: owner });
  if (classifyOwnerCode(code) === "eoa") return { kind: "eoa", owner };
  try {
    const blockNumber = await getBlockNumber(client, { cacheTime: 0 });
    const read = <TName extends "VERSION" | "getOwners" | "getThreshold">(functionName: TName) =>
      readContract(client, { address: owner, abi: safeReadAbi, functionName, blockNumber });
    const [version, signers, threshold] = await Promise.all([
      read("VERSION"),
      read("getOwners"),
      read("getThreshold"),
    ]);
    if (!isSupportedSafeVersion(version) || threshold < 1n || threshold > BigInt(signers.length)) {
      return { kind: "unsupported", owner };
    }
    return { kind: "safe", owner, signers, threshold: Number(threshold) };
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
    queryFn: () => readAssetOwnerInfo(client!, ownerAddress!),
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
