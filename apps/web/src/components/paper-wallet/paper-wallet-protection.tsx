import { Trans, useLingui } from "@lingui/react/macro";
import { FiLock, FiUnlock } from "react-icons/fi";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { PasswordInput } from "#/components/ui/password-input";
import { Switch } from "#/components/ui/switch";
import { encryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { buildPaperWalletUrl } from "#/lib/paper-wallet";
import { cn } from "#/lib/utils";

type UsePaperWalletProtectionProps = {
  privateKey: `0x${string}`;
};

type PaperWalletProtectionSlots = {
  qrUrl: string;
  controls: ReactNode;
  isReady: boolean;
  isEncrypting: boolean;
  needsPassword: boolean;
  /** Applies the password; the screen's own button calls it. */
  protect: () => Promise<void>;
};

export function usePaperWalletProtection({
  privateKey,
}: UsePaperWalletProtectionProps): PaperWalletProtectionSlots {
  const { t } = useLingui();
  const [enabled, setEnabled] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [encryptedPayload, setEncryptedPayload] = useState<string | null>(null);
  const [encrypting, setEncrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = !enabled || encryptedPayload !== null;
  const activePayload = enabled ? (encryptedPayload ?? "") : privateKey;
  const qrUrl = useMemo(() => buildPaperWalletUrl(activePayload), [activePayload]);

  function handleEnabledChange(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    setError(null);
    setEncryptedPayload(null);
    if (!nextEnabled) {
      setPassphrase("");
      setConfirmPassphrase("");
    }
  }

  function handlePassphraseChange(next: string) {
    setPassphrase(next);
    setEncryptedPayload(null);
    setError(null);
  }

  function handleConfirmPassphraseChange(next: string) {
    setConfirmPassphrase(next);
    setEncryptedPayload(null);
    setError(null);
  }

  async function handleProtect() {
    setError(null);

    if (passphrase.trim() === "") {
      setError(t`Password cannot be empty.`);
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError(t`Passwords do not match.`);
      return;
    }

    setEncrypting(true);
    try {
      const encrypted = await encryptPaperWalletPrivateKey(privateKey, passphrase);
      setEncryptedPayload(encrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not protect this sign-in card.`);
    } finally {
      setEncrypting(false);
    }
  }

  const controls = (
    <section className="border border-border bg-card">
      <label className="flex cursor-pointer items-start gap-3 p-3">
        {enabled ? (
          <FiLock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <FiUnlock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground text-sm">
            <Trans>Protect with a password</Trans>
          </span>
          <span
            className={cn(
              "mt-1 block text-xs",
              enabled ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {enabled ? (
              encryptedPayload ? (
                <Trans>Protected. Keep the password separate from the card.</Trans>
              ) : (
                <Trans>Enter a password before saving.</Trans>
              )
            ) : (
              <Trans>Not protected. Anyone who scans this card can access your wallet.</Trans>
            )}
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={handleEnabledChange} />
      </label>

      {enabled ? (
        <div className="space-y-3 border-border border-t p-3">
          <div className="space-y-1.5">
            <label htmlFor="pw-passphrase" className="font-medium text-foreground text-sm">
              <Trans>Password</Trans>
            </label>
            <PasswordInput
              id="pw-passphrase"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => handlePassphraseChange(event.target.value)}
              aria-invalid={!!error}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pw-passphrase-confirm" className="font-medium text-foreground text-sm">
              <Trans>Confirm password</Trans>
            </label>
            <PasswordInput
              id="pw-passphrase-confirm"
              autoComplete="new-password"
              value={confirmPassphrase}
              onChange={(event) => handleConfirmPassphraseChange(event.target.value)}
              aria-invalid={!!error}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  return {
    qrUrl,
    controls,
    isReady,
    isEncrypting: encrypting,
    /** Protection is on and its password has not been applied yet. */
    needsPassword: enabled && encryptedPayload === null,
    protect: handleProtect,
  };
}
