import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiCheckboxCircleLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";

import { useSwitchToNewCard } from "../hooks/use-key-rotation";
import { useRotationSession } from "../state/rotation-session";
import { CardReader } from "./card-reader";
import { RotationNotice } from "./rotation-notice";

/**
 * Reads the saved new card back before anything changes, so the account never
 * moves to a key nobody kept. Then replaces the old card.
 */
export function VerifyCardStep({
  newAddress,
  proof,
}: {
  newAddress: `0x${string}`;
  /** How the old card confirms; "passkey" when the account has an active one. */
  proof: "card" | "passkey";
}) {
  const { t } = useLingui();
  const setStep = useRotationSession((state) => state.setStep);
  const [checked, setChecked] = useState(false);
  const replace = useSwitchToNewCard();

  if (!checked) {
    return (
      <CardReader
        expected={newAddress}
        title={t`Scan your new card`}
        onKey={() => setChecked(true)}
        onCancel={() => setStep("card")}
      />
    );
  }

  const error = replace.error
    ? replace.error instanceof BackendApiError
      ? formatBackendApiError(replace.error)
      : replace.error.message
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5 border border-border bg-card p-3 text-sm">
        <RiCheckboxCircleLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <Trans>Your new card is ready.</Trans>
        </p>
      </div>
      <RotationNotice>
        {proof === "passkey" ? (
          <Trans>
            Confirm with your passkey. Your old card will stop working for sign-in, on every device.
          </Trans>
        ) : (
          <Trans>Your old card will stop working for sign-in, on every device.</Trans>
        )}
      </RotationNotice>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      <Button
        tap
        className="w-full"
        pending={replace.isPending}
        onClick={() => replace.mutate(proof)}
      >
        {replace.isPending ? t`Replacing…` : t`Replace sign-in card`}
      </Button>
    </div>
  );
}
