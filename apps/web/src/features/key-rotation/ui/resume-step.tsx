import {
  keyRotationsQueryOptions,
  webAuthnCredentialsQueryOptions,
} from "@clc/api/features/auth/queries";
import { webAuthnKeyHash } from "@clc/core/features/webauthn/index";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RiFingerprintLine, RiQrScan2Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { authClient } from "#/lib/api/auth";

import { useRotationSession } from "../state/rotation-session";
import { CardReader } from "./card-reader";

/**
 * Picks up "move what's left" for a card this account replaced: after a
 * reload, or once a lost card turns up. The old wallet's key comes from
 * scanning that card, or from a passkey that was registered on it.
 */
export function ResumeStep({ from, address }: { from: `0x${string}`; address: `0x${string}` }) {
  const { t } = useLingui();
  const resume = useRotationSession((state) => state.resume);
  const [scanning, setScanning] = useState(false);
  const rotations = useQuery({ ...keyRotationsQueryOptions(authClient, address) });
  const credentials = useQuery({ ...webAuthnCredentialsQueryOptions(authClient, address) });

  if (rotations.isPending) return <ListSkeleton label={t`Loading`} count={1} />;
  const replaced = rotations.data?.some(
    (rotation) => rotation.oldAddress.toLowerCase() === from.toLowerCase(),
  );
  if (!replaced) {
    return (
      <p role="alert" className="text-destructive text-xs">
        <Trans>This account did not replace that sign-in card.</Trans>
      </p>
    );
  }

  if (scanning) {
    return (
      <CardReader
        expected={from}
        title={t`Scan your old card`}
        onKey={(key) => resume(from, address, { kind: "card", key })}
        onCancel={() => setScanning(false)}
      />
    );
  }

  // Any passkey from the old wallet still signs for it on chain, whatever
  // state clc-core now records for it on the new one.
  const passkey = credentials.data?.credentials.find(
    (credential) => credential.publicKeyX && credential.publicKeyY,
  );
  const passkeySigner =
    passkey?.publicKeyX && passkey.publicKeyY
      ? {
          kind: "passkey" as const,
          credentialId: passkey.credentialId,
          keyHash: webAuthnKeyHash(BigInt(passkey.publicKeyX), BigInt(passkey.publicKeyY)),
        }
      : null;

  return (
    <div className="space-y-3">
      <Button tap className="w-full" onClick={() => setScanning(true)}>
        <RiQrScan2Line className="size-4" aria-hidden="true" />
        <Trans>Scan the old card</Trans>
      </Button>
      {passkeySigner ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          onClick={() => resume(from, address, passkeySigner)}
        >
          <RiFingerprintLine className="size-4" aria-hidden="true" />
          <Trans>Use my passkey</Trans>
        </Button>
      ) : null}
    </div>
  );
}
