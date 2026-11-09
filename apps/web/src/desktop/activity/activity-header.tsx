import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";

import { UnreadCount, UnreadCountLabel } from "#/components/ui/unread-count";
import { DeskTab, DeskTabs } from "#/desktop/ui/tabs";
import { DeskTitleRow } from "#/desktop/ui/page";
import { useActivityCounts } from "#/features/messaging/hooks/use-activity-counts";
import { ACTIVITY_SECTIONS, type ActivitySection } from "#/lib/navigation/activity-search";

/**
 * Activity's title and, with messaging on, its four sections. Each section is
 * a link, so switching pushes history and Back returns to the previous one.
 * The selected section does nothing unless a thread is open beside it, where
 * it closes the thread.
 */
export function ActivityHeader({
  section,
  sections,
  threadOpen = false,
}: {
  section: ActivitySection;
  /** False while messaging is off: Activity is the Transactions table alone. */
  sections: boolean;
  threadOpen?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <DeskTitleRow title={<Trans>Activity</Trans>} />
      {sections ? <ActivitySectionTabs current={section} threadOpen={threadOpen} /> : null}
    </div>
  );
}

function ActivitySectionTabs({
  current,
  threadOpen,
}: {
  current: ActivitySection;
  threadOpen: boolean;
}) {
  const { t } = useLingui();
  const counts = useActivityCounts();
  const labels: Record<ActivitySection, string> = {
    transactions: t`Transactions`,
    messages: t`Messages`,
    notifications: t`Notifications`,
    helpdesk: t`Helpdesk`,
  };
  const sectionCounts: Record<ActivitySection, number> = {
    transactions: counts.transactions,
    messages: counts.messages,
    notifications: 0,
    helpdesk: counts.helpdesk,
  };
  return (
    <DeskTabs label={t`Activity sections`}>
      {ACTIVITY_SECTIONS.map((section) => {
        const active = section === current;
        const count = sectionCounts[section];
        return (
          <DeskTab key={section} active={active}>
            <Link
              to="/"
              search={{
                tab: "activity",
                section: section === "transactions" ? undefined : section,
              }}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                if (
                  active &&
                  !threadOpen &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                }
              }}
              className="inline-flex items-center gap-1.5"
            >
              <span>
                {labels[section]}
                <UnreadCountLabel count={count} />
              </span>
              <UnreadCount count={count} />
            </Link>
          </DeskTab>
        );
      })}
    </DeskTabs>
  );
}
