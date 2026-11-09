import { hasProfileGaps, profileGaps } from "@clc/core/features/signup/completeness";
import { useMemo, useState } from "react";

import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { readOwnerScoped, writeOwnerScoped } from "#/lib/storage/owner-scoped-storage";

/** The phone banner reads this key too: dismissing the nudge on either view dismisses it on both. */
const DISMISSED_KEY = "profile-nudge.dismissed";

/**
 * Whether to ask this account to finish its profile, and how to stop asking.
 *
 * Accounts issued in bulk as paper wallets start with placeholders, so the
 * Wallet nudges the holder toward Edit profile. It is a nudge, not a gate, and
 * a dismissal is remembered per account because one device may serve several
 * people. Nothing shows until the profile has loaded and really has gaps.
 */
export function useProfileNudge(address: string | undefined) {
  const profile = useAuthProfile();
  const owner = address?.toLowerCase();
  const persisted = useMemo(
    () => (owner ? readOwnerScoped(owner, DISMISSED_KEY) === "1" : true),
    [owner],
  );
  const [dismissedOwner, setDismissedOwner] = useState<string | null>(null);

  const dismissed = !owner || persisted || dismissedOwner === owner;
  const visible = !dismissed && !!profile.data && hasProfileGaps(profileGaps(profile.data));

  return {
    visible,
    dismiss: () => {
      if (!owner) return;
      writeOwnerScoped(owner, DISMISSED_KEY, "1");
      setDismissedOwner(owner);
    },
  };
}
