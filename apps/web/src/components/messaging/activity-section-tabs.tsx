import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";

import { UnreadCount, UnreadCountLabel } from "#/components/ui/unread-count";
import type { ActivitySection } from "#/lib/navigation/activity-search";
import { ACTIVITY_SECTION_ICONS } from "#/lib/navigation/activity-section-icons";
import { cn } from "#/lib/utils";

export type ActivitySectionCounts = Partial<Record<ActivitySection, number>>;

/**
 * Activity's sub-tabs. Each is a link, so switching pushes history and Back
 * returns to the previous sub-tab; the selected one does nothing.
 */
export function ActivitySectionTabs({
  current,
  counts,
}: {
  current: ActivitySection;
  counts: ActivitySectionCounts;
}) {
  const { t } = useLingui();
  const labels: Record<ActivitySection, string> = {
    transactions: t`Transactions`,
    messages: t`Messages`,
    notifications: t`Notifications`,
    helpdesk: t`Helpdesk`,
  };
  const sections: ActivitySection[] = ["transactions", "messages", "notifications", "helpdesk"];
  return (
    <nav
      aria-label={t`Activity sections`}
      className="grid grid-cols-4 border border-border bg-card"
    >
      {sections.map((section) => {
        const active = section === current;
        const count = counts[section] ?? 0;
        const Icon = ACTIVITY_SECTION_ICONS[section];
        return (
          <Link
            key={section}
            to="/"
            search={{
              tab: "activity",
              section: section === "transactions" ? undefined : section,
            }}
            aria-current={active ? "page" : undefined}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              if (active && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
              }
            }}
            className={cn(
              "flex h-9 min-w-0 items-center justify-center gap-1 border-border border-e px-1 font-medium text-muted-foreground text-xs last:border-e-0",
              active && "bg-foreground font-semibold text-background",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">
              {labels[section]}
              <UnreadCountLabel count={count} />
            </span>
            <UnreadCount count={count} className="shrink-0" />
          </Link>
        );
      })}
    </nav>
  );
}
