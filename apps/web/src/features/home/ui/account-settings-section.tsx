import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiArrowRightSLine, RiUser3Line } from "react-icons/ri";

import { ProgressiveImage } from "#/components/ui/progressive-image";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";

/**
 * Settings' Account row: the member's photo, name, username and contact, and
 * the way into Edit profile.
 */
export function AccountSettingsSection() {
  const { t } = useLingui();
  const profileQuery = useAuthProfile();

  if (profileQuery.isPending) {
    return (
      <div aria-busy="true" className="flex items-center gap-3 p-3">
        <span className="size-10 shrink-0 rounded-full bg-muted" />
        <span className="flex-1 space-y-1.5">
          <span className="block h-3 w-34 bg-muted" />
          <span className="block h-3 w-22 bg-muted" />
          <span className="block h-3 w-28 bg-muted" />
        </span>
      </div>
    );
  }

  const name = profileQuery.data?.name?.trim();
  const username = profileQuery.data?.username;
  const phone = profileQuery.data?.phone?.trim();
  const email = profileQuery.data?.email?.trim();
  // Hide the signup placeholder email so the summary reads "Add contact details".
  const realEmail = email && !email.endsWith("@clc.local") ? email : "";
  const contact = phone || realEmail;
  const avatarUrl = profileQuery.data?.avatarUrl;
  const initials = name ? initialsOf(name) : "";

  return (
    <Link
      to="/settings/profile"
      className="flex items-center gap-3 p-3 outline-none active:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
    >
      {/* `relative` anchors ProgressiveImage's skeleton to the avatar. */}
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-heading font-semibold text-sm text-foreground">
        {avatarUrl ? (
          <ProgressiveImage src={avatarUrl} alt="" className="size-full object-cover" />
        ) : initials ? (
          <span aria-hidden="true">{initials}</span>
        ) : (
          <RiUser3Line className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">
          <span dir="auto">{name || t`Your profile`}</span>
        </span>
        {/* Its own line: appended to the name, a long name truncated it away. */}
        {username ? (
          <span className="block truncate font-mono text-xs">
            <bdi dir="ltr">{username}</bdi>
          </span>
        ) : null}
        <span className="block truncate text-muted-foreground text-xs">
          {/* Isolated LTR: unisolated in Arabic, the digit groups of a phone
              number reorder (+254 712 345 678 reads 678 345 712 254+). */}
          {contact ? <bdi dir="ltr">{contact}</bdi> : t`Add your contact details`}
        </span>
      </span>
      <RiArrowRightSLine
        className="rtl:-scale-x-100 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}

/** Up to two initials, by code point so a name starting with an emoji survives. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase();
}
