import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiArrowRightSLine, RiUser3Line } from "react-icons/ri";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";

export function AccountSettingsSection() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();

  const name = profileQuery.data?.name?.trim();
  const username = profileQuery.data?.username;
  const phone = profileQuery.data?.phone?.trim();
  const email = profileQuery.data?.email?.trim();
  // Hide the signup placeholder email so the summary reads "Add contact details".
  const realEmail = email && !email.endsWith("@clc.local") ? email : "";
  const subtitle = phone || realEmail || t`Add your contact details`;

  return (
    <section aria-labelledby="account-title" className="space-y-3">
      <h2 id="account-title">
        <Trans>Account</Trans>
      </h2>
      <Link
        to="/settings/profile"
        className="flex items-center gap-3 border border-border bg-card p-4 active:bg-muted"
      >
        <div className="flex size-9 shrink-0 items-center justify-center bg-muted text-foreground">
          <RiUser3Line className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            <span dir="auto">{name || t`Your profile`}</span>
          </p>
          {/* Its own line: appended to the name, a long name truncated it away. */}
          {username ? (
            <p className="truncate font-mono text-xs">
              <bdi dir="ltr">{username}</bdi>
            </p>
          ) : null}
          <p className="truncate text-muted-foreground text-xs">{subtitle}</p>
        </div>
        <RiArrowRightSLine
          className="rtl:-scale-x-100 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
