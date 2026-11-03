import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { FiLock } from "react-icons/fi";
import { RiEdit2Line } from "react-icons/ri";

import { usePaperWalletProtection } from "#/components/paper-wallet/paper-wallet-protection";
import { usePaperWalletSetup } from "#/components/paper-wallet/paper-wallet-setup";
import { AgreementField } from "#/components/ui/agreement-field";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { SettingsSheet } from "#/components/ui/settings-sheet";

import { useRotationSession } from "../state/rotation-session";
import { RotationNotice } from "./rotation-notice";

/**
 * The new card, made like a first one: an optional password, then a saved or
 * printed copy. Nothing moves until the next step reads that copy back.
 */
export function NewCardStep({
  newKey,
  newAddress,
}: {
  newKey: `0x${string}`;
  newAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const setStep = useRotationSession((state) => state.setStep);
  const protection = usePaperWalletProtection({ privateKey: newKey });
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const setup = usePaperWalletSetup({
    address: newAddress,
    qrUrl: protection.qrUrl,
    defaultName: t`Sign-in card`,
    downloadDisabled: !protection.isReady || protection.isEncrypting,
    downloaded,
    onDownloaded: () => setDownloaded(true),
  });

  return (
    <div className="space-y-6">
      <RotationNotice>
        <Trans>
          Save the new card before going on. If you add a password, keep it separately. Without a
          password, anyone who scans the card can access your wallet.
        </Trans>
      </RotationNotice>

      {protection.controls}

      {protection.needsPassword ? (
        <Button
          tap
          className="w-full"
          pending={protection.isEncrypting}
          onClick={() => void protection.protect()}
        >
          <FiLock className="size-4" aria-hidden="true" />
          {protection.isEncrypting ? t`Applying password…` : t`Apply password`}
        </Button>
      ) : (
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <SectionHeading variant="section">
              <Trans>Save your new card</Trans>
            </SectionHeading>
            <Button
              variant="outline"
              tap
              className="shrink-0"
              aria-haspopup="dialog"
              onClick={() => setCustomizeOpen(true)}
            >
              <RiEdit2Line className="size-4" aria-hidden="true" />
              <Trans>Customize</Trans>
            </Button>
          </div>
          {setup.card}
          {setup.downloadButton}
          <AgreementField
            id="rotation-saved-card"
            checked={saved}
            onCheckedChange={setSaved}
            disabled={!downloaded}
          >
            <Trans>I saved my new sign-in card.</Trans>
          </AgreementField>
          <Button
            tap
            className="w-full"
            disabled={!downloaded || !saved}
            onClick={() => setStep("verify")}
          >
            <Trans>Continue</Trans>
          </Button>
        </section>
      )}

      <SettingsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title={t`Customize`}
        footer={
          <Button tap className="w-full" onClick={() => setCustomizeOpen(false)}>
            <Trans>Done</Trans>
          </Button>
        }
      >
        {setup.controls}
      </SettingsSheet>
    </div>
  );
}
