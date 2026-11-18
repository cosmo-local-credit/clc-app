import type { ActivityKind } from "@clc/api/features/accounts/client";

import { ActivityHeader } from "#/desktop/activity/activity-header";
import { TransactionsDesk } from "#/desktop/activity/transactions-desk";
import { HelpdeskDesk } from "#/desktop/messaging/helpdesk-desk";
import { MessagesDesk } from "#/desktop/messaging/messages-desk";
import { NotificationsDesk } from "#/desktop/messaging/notifications-desk";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";
import type { ActivitySection } from "#/lib/navigation/activity-search";
import type { MessageContextInput } from "@clc/core/features/messaging/logic";

/**
 * Activity on the desktop. With messaging on, `?section=` picks one of four
 * sections under the title; with it off, Activity is the Transactions table.
 */
export function ActivityDesk({
  section = "transactions",
  address,
  query,
  types,
  onQueryChange,
  onTypesChange,
  messageTo,
  messageContext,
  onMessageToConsumed,
}: {
  section?: ActivitySection;
  address?: string;
  query?: string;
  types?: readonly ActivityKind[];
  onQueryChange?: (query: string) => void;
  onTypesChange?: (types: readonly ActivityKind[]) => void;
  messageTo?: `0x${string}`;
  messageContext?: MessageContextInput;
  onMessageToConsumed?: () => void;
}) {
  const current = MESSAGING_ENABLED ? section : "transactions";
  const header = <ActivityHeader section={current} sections={MESSAGING_ENABLED} />;
  if (current === "messages") {
    return (
      <MessagesDesk
        header={header}
        messageTo={messageTo}
        messageContext={messageContext}
        onMessageToConsumed={onMessageToConsumed}
      />
    );
  }
  if (current === "notifications") return <NotificationsDesk header={header} />;
  if (current === "helpdesk") return <HelpdeskDesk header={header} />;
  return (
    <TransactionsDesk
      header={header}
      address={address}
      query={query}
      types={types}
      onQueryChange={onQueryChange}
      onTypesChange={onTypesChange}
    />
  );
}
