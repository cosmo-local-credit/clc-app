import { buildVoucherMintCall } from "@clc/core/features/vouchers/logic";
import { useMutation } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { useReportWriteError } from "#/features/safe/hooks/use-report-write-error";
import { useSafeWrite } from "#/features/safe/hooks/use-safe-write";
import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

import { useVoucherActionInFlight } from "./use-voucher-action-in-flight";

const relayerClient = createRelayerClient(RELAYER_URL);

export type VoucherMintInput = {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  /** A multisig owner may mint straight to another account. */
  recipientAddress?: `0x${string}`;
  amountRaw: string;
  includeAuthorization?: boolean;
};

/** Every voucher mint; `inFlight` narrows it to one voucher by its variables. */
const VOUCHER_MINT_MUTATION_KEY = ["vouchers", "mint"] as const;

/**
 * Mints to the owner. A Safe owner goes through the proposal flow: the call is
 * the same, the Safe is `msg.sender` to the token and the supply lands in the
 * Safe. `inFlight` is true while a mint of `asset` runs from any view.
 */
export function useVoucherMint(asset?: { address: string; ownerAddress?: string | null }) {
  const { connector } = useConnection();
  const owner = useAssetOwnerInfo(asset?.address ?? "", asset?.ownerAddress);
  const safeWrite = useSafeWrite();
  const reportError = useReportWriteError();
  const inFlight = useVoucherActionInFlight(
    { mutationKey: VOUCHER_MINT_MUTATION_KEY },
    asset?.address,
  );
  return {
    ...useMutation({
      mutationKey: VOUCHER_MINT_MUTATION_KEY,
      mutationFn: async (input: VoucherMintInput) => {
        const call = buildVoucherMintCall(input);
        if (asset && owner.info?.kind === "safe" && owner.isSafeSigner) {
          return safeWrite.write({
            safe: owner.info.owner,
            calls: [call],
          });
        }
        return relayCaliburBatch(
          {
            senderAddress: input.ownerAddress,
            connectorId: connector?.id,
            calls: [call],
            includeAuthorization: input.includeAuthorization,
          },
          relayerClient,
        );
      },
    }),
    reportError,
    inFlight,
  };
}
