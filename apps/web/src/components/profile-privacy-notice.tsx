import { Trans } from "@lingui/react/macro";

export function ProfilePrivacyNotice() {
  return (
    <p className="border border-border bg-card p-3 text-xs text-muted-foreground">
      <Trans>
        A signed-in person can find your username and wallet only by entering your exact username or
        full phone number. Your profile name, email, phone number, and saved location are not shown
        in recipient results. Public resource forms show any details they will publish so you can
        remove or change them before publishing.
      </Trans>
    </p>
  );
}
