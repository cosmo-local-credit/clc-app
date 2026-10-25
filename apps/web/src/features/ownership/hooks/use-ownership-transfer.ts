import { poolKeys } from "@clc/api/features/pools/queries";
import { voucherKeys } from "@clc/api/features/market/queries";
import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { wantKeys } from "@clc/api/features/wants/queries";
import { ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import type { CaliburCall } from "@clc/core/features/webauthn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient, useConnection } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CHAIN_ID } from "#/lib/chain";
import { poolsClient } from "#/lib/api/pools";
import { marketClient } from "#/lib/api/market";
import { accountWalletQueryKeys } from "#/features/wallet/hooks/use-account-balances";
import { assetOwnerKey, readConfirmedAssetOwner } from "./use-asset-owner";
import { OwnershipSettlementError } from "../api/wait-for-ownership-relay";
import {
  ownershipKey,
  saveOwnershipSubmission,
  useOwnershipSubmissions,
  type OwnershipSubmission,
} from "../state/ownership-submissions";

export type OwnershipTransferInput = {
  assetAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  newOwnerAddress: `0x${string}`;
};
export type SubmitOwnership = (input: {
  calls: CaliburCall[];
  trackingId?: string;
  onSubmitted: (id: string) => void;
  onConfirmed: (id: string, txHash: string) => void;
}) => Promise<{ trackingId: string; txHash: string }>;

export function useOwnershipTransfer(
  kind: "pool" | "voucher",
  submit: SubmitOwnership,
  prepare: (input: OwnershipTransferInput) => Promise<CaliburCall[]>,
) {
  const client = useClient({ chainId: CHAIN_ID });
  const connection = useConnection();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    scope: { id: `ownership-${kind}` },
    mutationFn: async (input: OwnershipTransferInput) => {
      const { assetAddress, ownerAddress } = input;
      if (!client || client.chain?.id !== CHAIN_ID)
        throw new Error("The configured chain is unavailable.");
      if (
        !auth.isAuthenticated ||
        auth.session?.address.toLowerCase() !== ownerAddress.toLowerCase() ||
        connection.address?.toLowerCase() !== ownerAddress.toLowerCase()
      ) {
        throw new Error("Connect and sign in with this asset's current owner wallet.");
      }
      let saved: OwnershipSubmission | undefined =
        useOwnershipSubmissions.getState().submissions[ownershipKey(assetAddress)];
      if (saved?.confirmed) {
        const current = await readConfirmedAssetOwner(client, assetAddress, saved);
        if (current.toLowerCase() === ownerAddress.toLowerCase()) {
          useOwnershipSubmissions.getState().remove(assetAddress);
          saved = undefined;
        }
      }
      if (saved && saved.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
        throw new Error(
          "A previous ownership submission must be reconciled before another handover.",
        );
      }
      const recipient =
        saved?.newOwnerAddress ??
        (ownershipRecipientSchema(ownerAddress, [assetAddress]).parse(
          input.newOwnerAddress,
        ) as `0x${string}`);
      let trackingId = saved?.trackingId;
      if (!saved?.confirmed) {
        const calls = saved ? [] : await prepare({ ...input, newOwnerAddress: recipient });
        // Storage must work before requesting a signature. An accepted tracking
        // ID is persisted by onSubmitted before the first settlement poll.
        try {
          localStorage.setItem("clc.ownership-storage-check", "1");
          localStorage.removeItem("clc.ownership-storage-check");
        } catch {
          throw new Error(
            "This browser is blocking local storage, which a transfer needs to survive a reload.",
          );
        }
        const onConfirmed = (id: string, txHash: string) => {
          queryClient.setQueryData(assetOwnerKey(assetAddress), recipient);
          saveOwnershipSubmission(assetAddress, {
            trackingId: id,
            ownerAddress,
            newOwnerAddress: recipient,
            confirmed: true,
            txHash: txHash as `0x${string}`,
          });
        };
        try {
          const settled = await submit({
            calls,
            trackingId,
            onConfirmed,
            onSubmitted: (id) => {
              trackingId = id;
              saveOwnershipSubmission(assetAddress, {
                trackingId: id,
                ownerAddress,
                newOwnerAddress: recipient,
                confirmed: false,
              });
            },
          });
          trackingId = settled.trackingId;
          onConfirmed(settled.trackingId, settled.txHash);
        } catch (error) {
          if (error instanceof OwnershipSettlementError && error.terminal)
            useOwnershipSubmissions.getState().remove(assetAddress);
          throw error;
        }
      }
      // Publish chain authority before any potentially slow catalog read. Cancel
      // stale detail reads so they cannot restore the sender's controls.
      await queryClient.cancelQueries({ queryKey: assetOwnerKey(assetAddress) });
      queryClient.setQueryData(assetOwnerKey(assetAddress), recipient);
      // The transaction is confirmed even if the RPC/indexer is temporarily
      // unavailable. Report lag separately; never invite another signature.
      let ownershipRefreshed = false;
      try {
        const confirmed =
          useOwnershipSubmissions.getState().submissions[ownershipKey(assetAddress)];
        const owner = await readConfirmedAssetOwner(client, assetAddress, confirmed!);
        queryClient.setQueryData(assetOwnerKey(assetAddress), owner);
        ownershipRefreshed = true;
      } catch {
        /* confirmed state above remains authoritative */
      }
      let catalogSynced = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const detail =
            kind === "pool"
              ? await poolsClient.getPoolByAddress(assetAddress)
              : await marketClient.getMarketVoucher(assetAddress, undefined, { cache: "no-store" });
          if (detail.ownerAddress?.toLowerCase() === recipient.toLowerCase()) {
            const key =
              kind === "pool" ? poolKeys.detail(assetAddress) : voucherKeys.detail(assetAddress);
            await queryClient.cancelQueries({ queryKey: key });
            queryClient.setQueryData(key, detail);
            catalogSynced = true;
            break;
          }
        } catch {
          /* a catalog outage does not undo a successful transfer */
        }
        if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: poolKeys.all }),
        queryClient.invalidateQueries({ queryKey: voucherKeys.all }),
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.all }),
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
        queryClient.invalidateQueries({ queryKey: accountWalletQueryKeys.all }),
      ]);
      if (catalogSynced) useOwnershipSubmissions.getState().remove(assetAddress);
      return { trackingId: trackingId!, catalogSynced, ownershipRefreshed };
    },
  });
}
