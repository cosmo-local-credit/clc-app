import type { ActivityKind } from "@clc/api/features/accounts/client";
import { useLingui } from "@lingui/react/macro";

import { ActivitySectionTabs } from "#/components/messaging/activity-section-tabs";
import { HelpdeskSection } from "#/components/messaging/helpdesk-section";
import { MessagesSection } from "#/components/messaging/messages-section";
import { NotificationsSection } from "#/components/messaging/notifications-section";
import { useActivityCounts } from "#/features/messaging/hooks/use-activity-counts";
import type { ActivitySection } from "#/lib/navigation/activity-search";
import { ActivityPage } from "./activity-page";

/**
 * Activity with messaging on: four sub-tabs over today's feed. Only the
 * Transactions section mounts the feed, so only it marks Transactions as seen.
 */
export function ActivityInbox({
  section,
  address,
  query,
  types,
  onQueryChange,
  onTypesChange,
}: {
  section: ActivitySection;
  address?: string;
  query?: string;
  types?: readonly ActivityKind[];
  onQueryChange?: (query: string) => void;
  onTypesChange?: (types: readonly ActivityKind[]) => void;
}) {
  const { t } = useLingui();
  const counts = useActivityCounts();
  const tabs = (
    <ActivitySectionTabs
      current={section}
      counts={{
        transactions: counts.transactions,
        messages: counts.messages,
        helpdesk: counts.helpdesk,
      }}
    />
  );

  if (section === "transactions") {
    return (
      <ActivityPage
        address={address}
        query={query}
        types={types}
        onQueryChange={onQueryChange}
        onTypesChange={onTypesChange}
        sections={tabs}
      />
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="sr-only">{t`Activity`}</h1>
      <div className="sticky top-0 z-20 bg-background pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-1">
        {tabs}
      </div>
      {section === "messages" ? <MessagesSection /> : null}
      {section === "notifications" ? <NotificationsSection /> : null}
      {section === "helpdesk" ? <HelpdeskSection /> : null}
    </div>
  );
}
