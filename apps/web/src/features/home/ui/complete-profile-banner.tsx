import { hasProfileGaps, profileGaps } from "@clc/core/features/signup/completeness";
import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiCloseLine, RiUserSettingsLine } from "react-icons/ri";

import { ActionRow } from "#/components/ui/action-row";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { readOwnerScoped, writeOwnerScoped } from "#/lib/storage/owner-scoped-storage";

const DISMISSED_KEY = "profile-nudge.dismissed";

/**
 * Asks the holder of a bulk-issued paper wallet to finish their profile.
 *
 * Those accounts are created by an operator with placeholders for whatever the
 * CSV did not carry — often everything but a name — and web onboarding, which
 * normally collects a photo and contact details, never runs for them. This is
 * a nudge, not a gate: the wallet works without it. Dismissal is remembered per
 * account, since one phone may serve several people.
 */
export function CompleteProfileBanner({ address }: { address?: string }) {
  const { t } = useLingui();
  const profile = useAuthProfile();
  const owner = address?.toLowerCase();
  const [dismissed, setDismissed] = useState(
    () => !owner || readOwnerScoped(owner, DISMISSED_KEY) === "1",
  );

  if (dismissed || !owner || !profile.data) return null;
  const gaps = profileGaps(profile.data);
  if (!hasProfileGaps(gaps)) return null;

  // One row, like a settings row, with its dismiss cell beside it: the nudge
  // is a door to Edit profile, not a block of its own.
  return (
    <section
      aria-label={t`Complete your profile`}
      className="flex items-stretch border border-border bg-card"
    >
      <div className="min-w-0 flex-1">
        <ActionRow
          icon={<RiUserSettingsLine className="size-4 text-primary" aria-hidden="true" />}
          label={t`Complete your profile`}
          render={<Link to="/settings/profile" />}
        />
      </div>
      <button
        type="button"
        aria-label={t`Dismiss`}
        onClick={() => {
          writeOwnerScoped(owner, DISMISSED_KEY, "1");
          setDismissed(true);
        }}
        className="flex w-11 shrink-0 items-center justify-center border-border border-s text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      >
        <RiCloseLine className="size-4" aria-hidden="true" />
      </button>
    </section>
  );
}
