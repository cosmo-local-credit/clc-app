import {
  keyRotationsQueryOptions,
  webAuthnCredentialsQueryOptions,
} from "@clc/api/features/auth/queries";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { useLingui } from "@lingui/react/macro";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { getStoredKey, PRIVATE_KEY_CONNECTOR_ID } from "#/connectors/privateKey";
import { authClient } from "#/lib/api/auth";

import { RELINK_PASSKEYS_MUTATION_KEY, useRelinkPasskeys } from "./use-key-rotation";

/**
 * Settings' sign-in card rows, for either view: the latest card this account
 * replaced (to move what is left on it), and whether a passkey that came with
 * the account still has to be registered on the new card's wallet.
 */
export function useSignInCardSettings(address: `0x${string}`) {
  const { t } = useLingui();
  const { connector } = useConnection();
  const rotations = useQuery({ ...keyRotationsQueryOptions(authClient, address) });
  const credentials = useQuery({ ...webAuthnCredentialsQueryOptions(authClient, address) });
  const relink = useRelinkPasskeys();
  // A registration started before a layout switch remounted Settings is still
  // out; a second would be signed over the same Calibur nonce.
  const relinkInFlight = useIsMutating({ mutationKey: RELINK_PASSKEYS_MUTATION_KEY }) > 0;
  const [passkeyMoved, setPasskeyMoved] = useState(false);
  const moved = (credentials.data?.credentials ?? []).some(
    (credential) => credential.state === "moved",
  );

  const finishPasskeyMove = () => {
    const key = getStoredKey();
    if (!key) return;
    relink.mutate(
      { key },
      {
        onSuccess: () => {
          setPasskeyMoved(true);
          toast.success(t`Passkey moved`);
        },
        onError: (error) =>
          toast.error(
            error instanceof BackendApiError ? formatBackendApiError(error) : error.message,
          ),
      },
    );
  };

  return {
    latest: rotations.data?.[0],
    // Registering on the new wallet needs its root key: a card session.
    canRelink: connector?.id === PRIVATE_KEY_CONNECTOR_ID && moved,
    relinking: relink.isPending || relinkInFlight,
    passkeyMoved,
    finishPasskeyMove,
  };
}
