import {
  keyRotationsQueryOptions,
  webAuthnCredentialsQueryOptions,
} from "@clc/api/features/auth/queries";
import { formatBackendApiError, BackendApiError } from "@clc/api/client/errors";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiFingerprintLine, RiInboxUnarchiveLine, RiRefreshLine } from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { PasskeyRenameNotice } from "#/components/passkey-rename-notice";
import { ActionRow } from "#/components/ui/action-row";
import { getStoredKey, PRIVATE_KEY_CONNECTOR_ID } from "#/connectors/privateKey";
import { useRelinkPasskeys } from "#/features/key-rotation/hooks/use-key-rotation";
import { authClient } from "#/lib/api/auth";
import { KEY_ROTATION_ENABLED } from "#/lib/key-rotation-config";

/**
 * Replacing a compromised sign-in card, and the two things that can be left
 * after one: assets still on the old card, and a passkey not yet registered on
 * the new one.
 */
export function SignInCardSettingsSection({ address }: { address?: `0x${string}` }) {
  if (!KEY_ROTATION_ENABLED || !address) return null;
  return <SignInCardRows address={address} />;
}

function SignInCardRows({ address }: { address: `0x${string}` }) {
  const { t } = useLingui();
  const { connector } = useConnection();
  const rotations = useQuery({ ...keyRotationsQueryOptions(authClient, address) });
  const credentials = useQuery({ ...webAuthnCredentialsQueryOptions(authClient, address) });
  const relink = useRelinkPasskeys();
  const [passkeyMoved, setPasskeyMoved] = useState(false);
  const latest = rotations.data?.[0];
  const moved = (credentials.data?.credentials ?? []).some(
    (credential) => credential.state === "moved",
  );
  // Registering on the new wallet needs its root key: a card session.
  const canRelink = connector?.id === PRIVATE_KEY_CONNECTOR_ID && moved;

  return (
    <>
      <ActionRow
        icon={<RiRefreshLine className="size-4" aria-hidden="true" />}
        label={t`Replace sign-in card`}
        render={<Link to="/settings/sign-in-card" />}
      />
      {latest ? (
        <ActionRow
          icon={<RiInboxUnarchiveLine className="size-4" aria-hidden="true" />}
          label={t`Move what's left from an old card`}
          render={<Link to="/settings/sign-in-card" search={{ from: latest.oldAddress }} />}
        />
      ) : null}
      {canRelink ? (
        <ActionRow
          icon={<RiFingerprintLine className="size-4" aria-hidden="true" />}
          busy={relink.isPending}
          label={relink.isPending ? t`Moving passkey…` : t`Finish moving your passkey`}
          onClick={() => {
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
          }}
        />
      ) : null}
      {passkeyMoved ? <PasskeyRenameNotice /> : null}
    </>
  );
}
