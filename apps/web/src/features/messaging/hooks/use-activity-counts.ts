import { useActivityUnseen } from "#/features/wallet/hooks/use-activity-unseen";
import { useMessagingUnread } from "./use-messaging-unread";

/**
 * Each Activity sub-tab's count and their sum, which is the Activity badge.
 * Notifications has no count in v1: the in-app inbox records nothing as seen.
 */
export function useActivityCounts(): {
  transactions: number;
  messages: number;
  helpdesk: number;
  total: number;
} {
  const transactions = useActivityUnseen().count;
  const { messages, helpdesk } = useMessagingUnread();
  return { transactions, messages, helpdesk, total: transactions + messages + helpdesk };
}
