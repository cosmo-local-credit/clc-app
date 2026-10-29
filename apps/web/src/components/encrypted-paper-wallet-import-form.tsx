import { Trans, useLingui } from "@lingui/react/macro";
import { FiLock, FiX } from "react-icons/fi";

import { Button } from "#/components/ui/button";
import { PasswordInput } from "#/components/ui/password-input";
import { useEncryptedPaperWalletImport } from "#/components/use-encrypted-paper-wallet-import";
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
  const { passphrase, setPassphrase, error, decrypting, handleSubmit } =
    useEncryptedPaperWalletImport({ encryptedKey, onDecrypted });

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={cn("border-border bg-card space-y-3 border p-4", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">
            <Trans>Enter card password</Trans>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          tap
          aria-label={t`Close card password form`}
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
        <PasswordInput
          id="encrypted-paper-wallet-password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          aria-invalid={!!error}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        tap
        disabled={!passphrase.trim()}
        pending={decrypting}
        className="w-full"
      >
        <FiLock className="size-4" />
        {decrypting ? t`Unlocking…` : t`Unlock and sign in`}
      </Button>
    </form>
  );
}
