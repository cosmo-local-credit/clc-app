import { Trans } from "@lingui/react/macro";

export function PublicContactWarning() {
  return (
    <p className="border border-warning bg-card p-3 text-xs text-warning-foreground">
      <Trans>
        Contact details entered here will be public. Your profile contact details stay private
        unless you choose to add or share them.
      </Trans>
    </p>
  );
}
