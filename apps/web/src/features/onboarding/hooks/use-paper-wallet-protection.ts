import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

import { encryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { buildPaperWalletUrl } from "#/lib/paper-wallet";

/**
 * The paper wallet's password: whether the card is protected, the two password
 * fields, and the encrypted payload its QR carries once applied.
 */
export function usePaperWalletProtection({ privateKey }: { privateKey: `0x${string}` }) {
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

  return {
    qrUrl,
    enabled,
    setEnabled: handleEnabledChange,
    passphrase,
    setPassphrase: handlePassphraseChange,
    confirmPassphrase,
    setConfirmPassphrase: handleConfirmPassphraseChange,
    /** The password has been applied: the QR carries the encrypted key. */
    isProtected: encryptedPayload !== null,
    error,
    isReady,
    isEncrypting: encrypting,
    /** Protection is on and its password has not been applied yet. */
    needsPassword: enabled && encryptedPayload === null,
    /** Applies the password; the screen's own button calls it. */
    protect: handleProtect,
  };
}

export type PaperWalletProtection = ReturnType<typeof usePaperWalletProtection>;
