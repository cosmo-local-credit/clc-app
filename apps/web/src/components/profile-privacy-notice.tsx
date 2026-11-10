import { Trans } from "@lingui/react/macro";

import { cn } from "#/lib/utils";

export function ProfilePrivacyNotice({ className }: { className?: string }) {
  return (
    <aside
      className={cn("border border-primary/30 bg-card", className)}
      aria-labelledby="profile-privacy-title"
    >
      <p
        id="profile-privacy-title"
        className="border-primary/20 border-b bg-primary/[0.08] px-4 py-2.5 font-semibold text-primary text-sm leading-tight"
      >
        <Trans>Privacy note</Trans>
      </p>
      <p className="px-4 py-3 text-muted-foreground text-sm leading-snug">
        <Trans>
          People can find you only with your exact username or full phone number. Your name, email,
          phone, and location are not shown.
        </Trans>
      </p>
    </aside>
  );
}
