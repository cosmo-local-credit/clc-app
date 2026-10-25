import { createRelayerClient } from "@clc/api/features/relayer/client";
import type { SafeProposal } from "@clc/api/features/safe/client";
import { safeKeys } from "@clc/api/features/safe/queries";
import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient, useConnection, useSignTypedData } from "wagmi";
import type { SignTypedData } from "../api/sign-safe-transaction";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";
import {
  confirmSafeTransaction,
  executeSafeTransaction,
  proposeCancellation,
  proposeSafeTransaction,
  SafeProposedError,
} from "../api/safe-transactions";
import { useSafeSubmissions } from "../state/safe-submissions";

const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * The Safe half of the asset write seam, plus the confirm / execute / cancel
 * actions the pending sheet offers.
 *
 * `propose` is the same shape as an EOA batch: a call list in, settlement out.
 * At threshold 1 it signs and executes in one action. Above that it stops after
 * the proposal and rejects with `SafeProposedError`, which carries the
 * transaction so the caller can open it; nothing has changed on chain.
 */
export function useSafeWrite() {
  const queryClient = useQueryClient();
  const chain = useClient({ chainId: CHAIN_ID });
  const { address, connector } = useConnection();
  const delegation = useCaliburDelegation(address);
  const { signTypedDataAsync } = useSignTypedData();

  const signer = () => {
    if (!address) throw new Error("Connect your wallet to sign for this Safe.");
    if (delegation === "checking")
      throw new Error("Still checking your wallet. Try again in a moment.");
    return {
      senderAddress: address,
      connectorId: connector?.id,
      includeAuthorization: delegation === "not-delegated",
      sign: (typed: Parameters<SignTypedData>[0]) =>
        signTypedDataAsync({
          domain: typed.domain,
          types: typed.types,
          primaryType: typed.primaryType,
          message: typed.message,
        }),
    };
  };
  const requireChain = () => {
    if (!chain || chain.chain?.id !== CHAIN_ID)
      throw new Error("The configured chain is unavailable.");
    return chain;
  };
  const refresh = (proposal: SafeProposal) =>
    queryClient.invalidateQueries({ queryKey: safeKeys.pending(proposal.safe) });

  const execute = useMutation({
    scope: { id: "safe-write" },
    mutationFn: async (proposal: SafeProposal) => {
      const settled = await executeSafeTransaction({ relayer: relayerClient }, proposal, signer());
      await refresh(proposal);
      return settled;
    },
  });

  const confirmTx = useMutation({
    scope: { id: "safe-write" },
    mutationFn: async (proposal: SafeProposal) => {
      const confirmed = await confirmSafeTransaction({ safe: safeClient }, proposal, signer());
      await refresh(confirmed);
      return confirmed;
    },
  });

  const cancel = useMutation({
    scope: { id: "safe-write" },
    mutationFn: async (proposal: SafeProposal) => {
      const cancellation = await proposeCancellation({ safe: safeClient }, proposal, signer());
      await refresh(cancellation);
      return cancellation;
    },
  });

  /** Propose a call list for `assetAddress`; resolves settled, rejects `SafeProposedError` when quorum is pending. */
  const write = async (input: {
    assetAddress: string;
    safe: `0x${string}`;
    threshold: number;
    calls: CaliburCall[];
  }) => {
    const identity = signer();
    const proposal = await proposeSafeTransaction(
      { chain: requireChain(), safe: safeClient },
      { safe: input.safe, signer: identity, calls: input.calls },
    );
    useSafeSubmissions.getState().save(input.assetAddress, {
      safe: input.safe,
      safeTxHash: proposal.safeTxHash as `0x${string}`,
      nonce: proposal.nonce,
    });
    await queryClient.invalidateQueries({ queryKey: safeKeys.pending(input.safe) });
    if (proposal.confirmations.length < proposal.confirmationsRequired) {
      throw new SafeProposedError(proposal);
    }
    const settled = await executeSafeTransaction({ relayer: relayerClient }, proposal, identity);
    useSafeSubmissions.getState().remove(input.assetAddress);
    return settled;
  };

  return { write, execute, confirm: confirmTx, cancel };
}
