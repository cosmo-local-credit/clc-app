import { SidebarCount } from "#/components/admin/sidebar-count";
import { useAdminMessagingCounts } from "./use-helpdesk";

/** Open helpdesk conversations waiting on a support reply. */
export function HelpdeskNeedsReplyBadge() {
  const counts = useAdminMessagingCounts();
  return (
    <SidebarCount
      count={counts.isError ? undefined : counts.data?.helpdeskNeedsReply}
      label="helpdesk conversations waiting for a reply"
      title="Waiting for a reply"
    />
  );
}

/** Abuse reports nobody has decided yet. */
export function AbuseReportsOpenBadge() {
  const counts = useAdminMessagingCounts();
  return (
    <SidebarCount
      count={counts.isError ? undefined : counts.data?.abuseReportsOpen}
      label="open abuse reports"
      title="Open abuse reports"
    />
  );
}
