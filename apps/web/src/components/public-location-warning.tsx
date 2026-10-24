import { Trans } from "@lingui/react/macro";

export function PublicLocationWarning() {
  return (
    <p className="border border-warning bg-card p-3 text-xs text-warning-foreground">
      <Trans>
        The exact pin will be public. Choose a safe public meeting place, not a private home.
      </Trans>
    </p>
  );
}
