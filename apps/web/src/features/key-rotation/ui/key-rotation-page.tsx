import { webAuthnCredentialsQueryOptions } from "@clc/api/features/auth/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";

import { BackChevron } from "#/components/wallet/wallet-kit";
import { CALIBUR_WEBAUTHN_CONNECTOR_ID } from "#/connectors/calibur-webauthn";
import { getStoredKey, PRIVATE_KEY_CONNECTOR_ID } from "#/connectors/privateKey";
import { authClient } from "#/lib/api/auth";
import { getWebAuthnCredential } from "#/lib/webauthn-storage";

import { useNewCardRelink } from "../hooks/use-key-rotation";
import { type OldCardSigner, useRotationSession } from "../state/rotation-session";
import { MoveStep } from "./move-step";
import { NewCardStep } from "./new-card-step";
import { DoneStep, PasskeysStep } from "./passkeys-step";
import { ResumeStep } from "./resume-step";
import { ReviewStep } from "./review-step";
import { VerifyCardStep } from "./verify-card-step";

/** The signer for the card this session signed in with, if it holds one. */
function currentSigner(
  connectorId: string | undefined,
  address: `0x${string}`,
): OldCardSigner | null {
  if (connectorId === PRIVATE_KEY_CONNECTOR_ID) {
    const key = getStoredKey();
    return key ? { kind: "card", key } : null;
  }
  if (connectorId === CALIBUR_WEBAUTHN_CONNECTOR_ID) {
    const credential = getWebAuthnCredential();
    if (!credential || credential.address.toLowerCase() !== address.toLowerCase()) return null;
    return { kind: "passkey", credentialId: credential.credentialId, keyHash: credential.keyHash };
  }
  return null;
}

function sameAddress(a: string | null | undefined, b: string | null | undefined) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/**
 * Replacing a compromised sign-in card (GH #412), or with `from`, moving what
 * is left on one this account already replaced.
 */
export function KeyRotationPage({ from }: { from?: `0x${string}` }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address, connector } = useConnection();
  const step = useRotationSession((state) => state.step);
  const oldAddress = useRotationSession((state) => state.oldAddress);
  const newAddress = useRotationSession((state) => state.newAddress);
  const movedPasskeys = useRotationSession((state) => state.movedPasskeys);
  const setStep = useRotationSession((state) => state.setStep);
  const [passkeyMoved, setPasskeyMoved] = useState(false);
  // Survives a remount on the Done step, which local state does not.
  const relinked = useNewCardRelink()?.status === "success";
  const connectorId = connector?.id;

  // Begins for the signed-in card, unless this replacement is already under
  // way: the route remounts as the session moves to the new card, and the
  // flow must carry on rather than start over.
  useEffect(() => {
    if (from || !address) return;
    const session = useRotationSession.getState();
    if (sameAddress(session.oldAddress, address) || sameAddress(session.newAddress, address)) {
      return;
    }
    const signer = currentSigner(connectorId, address);
    if (signer) session.begin(address, signer);
    else session.clear();
  }, [address, connectorId, from]);

  const credentials = useQuery({
    ...webAuthnCredentialsQueryOptions(authClient, oldAddress ?? "none"),
    enabled: Boolean(oldAddress && sameAddress(oldAddress, address)),
  });
  const hasActivePasskey =
    credentials.data?.credentials.some((credential) => credential.state === "active") ?? false;
  const signerKind = useRotationSession((state) => state.oldSigner?.kind);
  const proof = hasActivePasskey || signerKind === "passkey" ? "passkey" : "card";

  const finish = () => {
    useRotationSession.getState().clear();
    void navigate({ to: "/", search: { tab: "settings" } });
  };

  let body;
  if (from && address && !sameAddress(oldAddress, from)) {
    body = <ResumeStep from={from} address={address} />;
  } else if (!oldAddress || !newAddress) {
    body = (
      <p role="alert" className="text-destructive text-xs">
        <Trans>Sign in with your sign-in card or passkey to replace it.</Trans>
      </p>
    );
  } else if (step === "review") {
    body = <ReviewStep />;
  } else if (step === "card") {
    const newKey = useRotationSession.getState().newKey;
    body = newKey ? <NewCardStep newKey={newKey} newAddress={newAddress} /> : null;
  } else if (step === "verify") {
    body = <VerifyCardStep newAddress={newAddress} proof={proof} />;
  } else if (step === "moving") {
    body = (
      <MoveStep
        onFinished={() => {
          if (movedPasskeys.length === 0) setPasskeyMoved(false);
          setStep(movedPasskeys.length > 0 ? "passkeys" : "done");
        }}
      />
    );
  } else if (step === "passkeys") {
    body = (
      <PasskeysStep
        onFinished={(moved) => {
          setPasskeyMoved(moved);
          setStep("done");
        }}
      />
    );
  } else {
    body = <DoneStep onDone={finish} passkeyMoved={passkeyMoved || relinked} />;
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
      <BackChevron label={t`Settings`} to="/" search={{ tab: "settings" }} />
      <h1 className="mb-6 font-heading text-[1.75rem] font-bold leading-tight">
        {from ? <Trans>Move what's left</Trans> : <Trans>Replace sign-in card</Trans>}
      </h1>
      {body}
    </div>
  );
}
