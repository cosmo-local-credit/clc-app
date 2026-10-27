import { Trans } from "@lingui/react/macro";
import { FiLock, FiUnlock } from "react-icons/fi";

import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import type { PaperWalletProtection } from "#/features/onboarding/hooks/use-paper-wallet-protection";
import { cn } from "#/lib/utils";

/** The phone's protection card: the switch, its status line, and the two password fields. */
export function PaperWalletProtectionControls({
  protection,
}: {
  protection: PaperWalletProtection;
}) {
  const { enabled, passphrase, confirmPassphrase, error } = protection;
  return (
    <section className="border border-border bg-card">
      <label className="flex cursor-pointer items-start gap-3 p-3">
        {enabled ? (
          <FiLock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <FiUnlock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground text-sm">
            <Trans>Protect paper wallet with a password</Trans>
          </span>
          <span
            className={cn(
              "mt-1 block text-xs",
              enabled ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {enabled ? (
              protection.isProtected ? (
                <Trans>Paper wallet is protected. Keep the password separate from the card.</Trans>
              ) : (
                <Trans>Enter and apply a password before downloading this card.</Trans>
              )
            ) : (
              <Trans>QR currently contains the raw private key.</Trans>
            )}
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={protection.setEnabled} />
      </label>

      {enabled ? (
        <div className="space-y-3 border-border border-t p-3">
          <div className="space-y-1.5">
            <label htmlFor="pw-passphrase" className="font-medium text-foreground text-sm">
              <Trans>Password</Trans>
            </label>
            <Input
              id="pw-passphrase"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => protection.setPassphrase(event.target.value)}
              aria-invalid={!!error}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pw-passphrase-confirm" className="font-medium text-foreground text-sm">
              <Trans>Confirm password</Trans>
            </label>
            <Input
              id="pw-passphrase-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassphrase}
              onChange={(event) => protection.setConfirmPassphrase(event.target.value)}
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
}
