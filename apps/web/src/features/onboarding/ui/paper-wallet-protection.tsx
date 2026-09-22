import { Trans, useLingui } from "@lingui/react/macro";
import { FiLoader, FiLock, FiUnlock } from "react-icons/fi";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { encryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { buildPaperWalletUrl } from "#/lib/paper-wallet";

type UsePaperWalletProtectionProps = {
  privateKey: `0x${string}`;
};

type PaperWalletProtectionSlots = {
  qrUrl: string;
  controls: ReactNode;
  isReady: boolean;
  isEncrypting: boolean;
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
      setError(err instanceof Error ? err.message : t`Could not protect this paper wallet.`);
    } finally {
      setEncrypting(false);
    }
  }

  const controls = (
    <section className="border-border bg-card mt-4 border p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => handleEnabledChange(event.target.checked)}
          className="accent-primary mt-0.5 size-4 cursor-pointer"
        />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block text-sm font-medium">
            <Trans>Protect paper wallet with a password</Trans>
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {enabled ? (
              encryptedPayload ? (
                <Trans>Paper wallet is protected. Keep the password separate from the card.</Trans>
              ) : (
                <Trans>Enter and apply a password before downloading this card.</Trans>
              )
            ) : (
              <Trans>QR currently contains the raw private key.</Trans>
            )}
          </span>
        </span>
        {enabled ? (
          <FiLock className="text-primary mt-0.5 size-4 shrink-0" />
        ) : (
          <FiUnlock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        )}
      </label>

      {enabled ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <label htmlFor="pw-passphrase" className="text-foreground text-sm font-medium">
              <Trans>Password</Trans>
            </label>
            <Input
              id="pw-passphrase"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => handlePassphraseChange(event.target.value)}
              aria-invalid={!!error}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pw-passphrase-confirm" className="text-foreground text-sm font-medium">
              <Trans>Confirm password</Trans>
            </label>
            <Input
              id="pw-passphrase-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassphrase}
              onChange={(event) => handleConfirmPassphraseChange(event.target.value)}
              aria-invalid={!!error}
            />
          </div>

          <Button
            className="h-11 w-full"
            disabled={encrypting}
            onClick={() => void handleProtect()}
          >
            {encrypting ? (
              <FiLoader className="mr-2 size-4 animate-spin" />
            ) : (
              <FiLock className="mr-2 size-4" />
            )}
            {encrypting
              ? t`Protecting paper wallet...`
              : encryptedPayload
                ? t`Update protected paper wallet`
                : t`Protect paper wallet`}
          </Button>

          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  return { qrUrl, controls, isReady, isEncrypting: encrypting };
}
