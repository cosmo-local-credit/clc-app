import { useLingui } from "@lingui/react/macro";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { decryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";

/**
 * Opening a password-protected paper wallet: the password, the decrypt, and
 * its error. The decrypted key goes straight to `onDecrypted` and is never
 * held here.
 */
export function useEncryptedPaperWalletImport({
  encryptedKey,
  onDecrypted,
}: {
  encryptedKey: string;
  onDecrypted: (privateKey: `0x${string}`) => Promise<void> | void;
}) {
  const { t } = useLingui();
  const [passphrase, setPassphraseState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!passphrase.trim()) {
      setError(t`Password cannot be empty.`);
      return;
    }
    setDecrypting(true);
    try {
      const privateKey = await decryptPaperWalletPrivateKey(encryptedKey, passphrase);
      await onDecrypted(privateKey);
      if (isMounted.current) setPassphraseState("");
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : t`Could not import this paper wallet.`);
      }
    } finally {
      if (isMounted.current) setDecrypting(false);
    }
  }

  return {
    passphrase,
    setPassphrase: (next: string) => {
      setPassphraseState(next);
      setError(null);
    },
    error,
    decrypting,
    handleSubmit,
  };
}
