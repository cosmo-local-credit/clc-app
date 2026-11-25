import type { ProfileVisibility } from "@clc/core/features/public-profiles/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "#/components/ui/section-heading";
import { Switch } from "#/components/ui/switch";

/** Layout-neutral form controls used by both profile editors. */
export function PublicProfileFields({
  value,
  onChange,
  address,
  disabled,
}: {
  value: ProfileVisibility;
  onChange: (next: ProfileVisibility) => void;
  address: string;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const fields: [keyof ProfileVisibility, string][] = [
    ["avatar", t`Profile photo`],
    ["name", t`Name`],
    ["bio", t`Bio`],
    ["website", t`Website`],
    ["country", t`Country`],
    ["preferredCurrency", t`Preferred unit of account`],
    ["email", t`Email`],
    ["phone", t`Phone`],
    ["locationName", t`Location`],
    ["preciseLocation", t`Map pin`],
    ["vouchers", t`Vouchers`],
    ["offers", t`Offers`],
    ["wants", t`Wants`],
    ["pools", t`Pools`],
    ["posts", t`Posts`],
    ["catalogs", t`Catalogs`],
  ];
  return (
    <section aria-label={t`Public profile`} className="space-y-4 border border-border bg-card p-4">
      <SectionHeading>
        <Trans>Public profile</Trans>
      </SectionHeading>
      <label className="flex items-center justify-between gap-4 text-sm font-medium">
        <Trans>Enable public profile</Trans>
        <Switch
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </label>
      {value.enabled ? (
        <>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Choose what appears on your profile. Shared email, phone and location are visible to
              signed-in users. Public resources and blockchain records remain visible elsewhere.
            </Trans>
          </p>
          <div className="grid gap-3">
            {fields.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-4 text-sm">
                {t`Show ${label}`}
                <Switch
                  checked={value[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
                />
              </label>
            ))}
          </div>
        </>
      ) : null}
      <Link
        to="/profiles/$address"
        params={{ address }}
        className="inline-block text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Trans>View my public profile</Trans>
      </Link>
    </section>
  );
}
