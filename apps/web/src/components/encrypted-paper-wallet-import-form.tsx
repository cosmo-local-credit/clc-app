import { Trans, useLingui } from "@lingui/react/macro";
import { FiLoader, FiLock, FiX } from "react-icons/fi";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { decryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { cn } from "#/lib/utils";

type EncryptedPaperWalletImportFormProps = {
  encryptedKey: string;
  onDecrypted: (privateKey: `0x${string}`) => Promise<void> | void;
  onCancel: () => void;
  className?: string;
};

export function EncryptedPaperWalletImportForm({
  encryptedKey,
  onDecrypted,
  onCancel,
  className,
}: EncryptedPaperWalletImportFormProps) {
  const { t } = useLingui();
  const [passphrase, setPassphrase] = useState("");
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
    setDecrypting(true);
    try {
      const privateKey = await decryptPaperWalletPrivateKey(encryptedKey, passphrase);
      await onDecrypted(privateKey);
      if (isMounted.current) setPassphrase("");
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : t`Could not import this paper wallet.`);
      }
    } finally {
      if (isMounted.current) setDecrypting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={cn("border-border bg-card space-y-3 border p-4", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">
            <Trans>Password-protected paper wallet</Trans>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            <Trans>Enter the password to unlock this paper wallet.</Trans>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Close password-protected wallet import`}
          onClick={onCancel}
          disabled={decrypting}
        >
          <FiX className="size-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <label htmlFor="encrypted-paper-wallet-password" className="text-sm font-medium">
          <Trans>Password</Trans>
        </label>
        <Input
          id="encrypted-paper-wallet-password"
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!passphrase.trim() || decrypting} className="h-11 w-full">
        {decrypting ? (
          <FiLoader className="me-2 size-4 animate-spin" />
        ) : (
          <FiLock className="me-2 size-4" />
        )}
        {decrypting ? t`Unlocking...` : t`Unlock and import`}
      </Button>
    </form>
  );
}
