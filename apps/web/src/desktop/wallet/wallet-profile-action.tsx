import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiArrowRightSLine, RiCloseLine, RiUserSettingsLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { useProfileNudge } from "#/features/home/hooks/use-profile-nudge";

/**
 * A single row that leads to Edit profile, shown only while the profile has
 * gaps (a bulk-issued paper wallet starts with placeholders) and until it is
 * dismissed for this account. A nudge, not a gate.
 */
export function WalletProfileAction({ address }: { address: string | undefined }) {
  const { t } = useLingui();
  const nudge = useProfileNudge(address);
  if (!nudge.visible) return null;

  return (
    <section
      aria-label={t`Complete your profile`}
      className="col-span-full flex items-stretch border border-border bg-card"
    >
      <Link
        to="/settings/profile"
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-muted/60"
      >
        <RiUserSettingsLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t`Complete your profile`}</span>
        <RiArrowRightSLine
          className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
          aria-hidden="true"
        />
      </Link>
      <div className="flex items-center border-border border-s px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t`Dismiss`}
          onClick={nudge.dismiss}
        >
          <RiCloseLine aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
