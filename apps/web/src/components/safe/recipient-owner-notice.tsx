import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { useClient } from "wagmi";
import {
  assetOwnerInfoKey,
  readAssetOwnerInfo,
} from "#/features/ownership/hooks/use-asset-owner-info";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_OWNERSHIP_ENABLED } from "#/lib/safe-config";

/**
 * What a handover recipient is, when that matters: a supported Safe is named
 * with its threshold, and any other contract is warned about, since an asset
 * handed to a contract that cannot call it is locked for good.
 */
export function RecipientOwnerNotice({ address }: { address: string }) {
  const client = useClient({ chainId: CHAIN_ID });
  const recipient = address.trim();
  const query = useQuery({
    queryKey: assetOwnerInfoKey(recipient),
    queryFn: () => readAssetOwnerInfo(client!, recipient as `0x${string}`),
    enabled: SAFE_OWNERSHIP_ENABLED && !!client && isAddress(recipient),
    staleTime: 30_000,
    retry: false,
  });
  const info = query.data;
  if (!info || info.kind === "eoa") return null;
  if (info.kind === "safe") {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {info.threshold === null ? (
          <Trans>Compatible multisig, {info.signers.length} signers</Trans>
        ) : (
          <Trans>
            Multisig, {info.threshold} of {info.signers.length} signers
          </Trans>
        )}
      </p>
    );
  }
  return (
    <p role="alert" className="text-destructive text-sm">
      <Trans>
        This contract does not expose a compatible multisig owner list. The asset could be locked.
      </Trans>
    </p>
  );
}
