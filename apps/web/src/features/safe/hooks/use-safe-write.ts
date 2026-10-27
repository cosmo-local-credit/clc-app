import type { CaliburCall } from "@clc/core/features/webauthn/index";
import { useQueryClient } from "@tanstack/react-query";
import { safeKeys } from "@clc/api/features/safe/queries";
import { useClient, useConnection, useSignTypedData } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import {
  proposeSafeTransaction,
  SafeDashboardRequiredError,
  SafePendingConflictError,
  SafeProposedError,
} from "../api/safe-transactions";
import { isPasskeyCancellation, SafePasskeyUnsupportedError } from "../api/sign-safe-transaction";

/** Best-effort proposal only. Settlement and quorum stay in the Safe dashboard. */
export function useSafeWrite() {
  const queryClient = useQueryClient();
  const chain = useClient({ chainId: CHAIN_ID });
  const { address, connector } = useConnection();
  const auth = useAuthStatus();
  const { signTypedDataAsync } = useSignTypedData();

  const write = async (input: { safe: `0x${string}`; calls: CaliburCall[] }): Promise<never> => {
    try {
      if (
        !address ||
        !auth.isAuthenticated ||
        auth.session?.address.toLowerCase() !== address.toLowerCase()
      )
        throw new Error("Connect and sign in with a signer of this multisig.");
      if (!chain || chain.chain?.id !== CHAIN_ID)
        throw new Error("The configured chain is unavailable.");
      const proposal = await proposeSafeTransaction(
        { chain, safe: safeClient },
        {
          safe: input.safe,
          calls: input.calls,
          signer: {
            senderAddress: address,
            connectorId: connector?.id,
            sign: (typed) => signTypedDataAsync(typed),
          },
        },
      );
      await queryClient.invalidateQueries({ queryKey: safeKeys.pending(input.safe) });
      // Deliberately stop even at threshold one. An accepted proposal is not a
      // completed mint/transfer and must not trigger the caller's success path.
      throw new SafeProposedError(proposal);
    } catch (error) {
      // A dismissed or unsupported passkey is reported as itself: the dashboard
      // fallback cannot help a passkey account.
      if (
        error instanceof SafeProposedError ||
        error instanceof SafePendingConflictError ||
        error instanceof SafePasskeyUnsupportedError ||
        isPasskeyCancellation(error)
      )
        throw error;
      throw new SafeDashboardRequiredError(
        input.safe,
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  return { write };
}
