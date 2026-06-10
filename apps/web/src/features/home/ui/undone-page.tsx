import { Trans, useLingui } from "@lingui/react/macro";
import { RiCommunityLine, RiNotification3Line } from "react-icons/ri";

export function UndonePage({ tab }: { tab: "activity" | "pool" }) {
  const { t } = useLingui();
  const title = tab === "activity" ? t`Activity` : t`Pools`;
  const description =
    tab === "activity"
      ? t`Recent voucher sends, redemptions, swaps, and pool events will appear here.`
      : t`Pool membership, limits, and stewardship tools will appear here.`;
  const Icon = tab === "activity" ? RiNotification3Line : RiCommunityLine;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1>{title}</h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Placeholder screen</Trans>
        </p>
      </div>
      <section className="border border-border bg-card p-4">
        <div className="flex size-9 items-center justify-center bg-muted text-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg">
          <Trans>Coming next</Trans>
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">{description}</p>
      </section>
    </div>
  );
}
