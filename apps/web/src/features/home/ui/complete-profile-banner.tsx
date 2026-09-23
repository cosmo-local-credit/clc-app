import { hasProfileGaps, profileGaps } from "@clc/core/features/signup/completeness";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiCloseLine, RiUserSettingsLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
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
  const { t, i18n } = useLingui();
  const profile = useAuthProfile();
  const owner = address?.toLowerCase();
  const [dismissed, setDismissed] = useState(
    () => !owner || readOwnerScoped(owner, DISMISSED_KEY) === "1",
  );

  if (dismissed || !owner || !profile.data) return null;
  const gaps = profileGaps(profile.data);
  if (!hasProfileGaps(gaps)) return null;

  const missing = [
    gaps.name ? t`your name` : null,
    gaps.avatar ? t`a profile photo` : null,
    gaps.contact ? t`an email or phone number` : null,
  ].filter((item): item is string => item !== null);
  const missingList = new Intl.ListFormat(i18n.locale, { type: "conjunction" }).format(missing);

  return (
    <section
      aria-label={t`Complete your profile`}
      className="flex items-start gap-3 border border-border bg-card p-4"
    >
      <RiUserSettingsLine className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium text-sm">
          <Trans>Complete your profile</Trans>
        </p>
        <p className="text-muted-foreground text-xs">
          <Trans>Add {missingList} so people in your community can recognise you.</Trans>
        </p>
        <Button asChild variant="outline">
          <Link to="/settings/profile">
            <Trans>Edit profile</Trans>
          </Link>
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t`Dismiss`}
        onClick={() => {
          writeOwnerScoped(owner, DISMISSED_KEY, "1");
          setDismissed(true);
        }}
      >
        <RiCloseLine className="size-4" />
      </Button>
    </section>
  );
}
