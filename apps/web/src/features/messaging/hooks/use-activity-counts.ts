import { useActivityUnseen } from "#/features/wallet/hooks/use-activity-unseen";
import { useMessagingUnread } from "./use-messaging-unread";
import { useOperatorHelpdeskCount } from "./use-operator-helpdesk";

/**
 * Each Activity sub-tab's count and their sum, which is the Activity badge.
 * Notifications has no count in v1: the in-app inbox records nothing as seen.
 */
export function useActivityCounts(operator = false): {
  transactions: number;
  messages: number;
  helpdesk: number;
  total: number;
} {
  const transactions = useActivityUnseen().count;
  const { messages, helpdesk: userHelpdesk } = useMessagingUnread();
  const operatorCounts = useOperatorHelpdeskCount(operator);
  const helpdesk = operator ? (operatorCounts.data?.helpdeskNeedsReply ?? 0) : userHelpdesk;
  return { transactions, messages, helpdesk, total: transactions + messages + helpdesk };
}
