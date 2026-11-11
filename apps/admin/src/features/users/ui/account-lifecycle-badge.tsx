import type { AccountLifecycle } from "@clc/core/features/account-retirement/logic";

import { StateBadge } from "#/components/admin/state-badge";
import { formatDate } from "#/lib/format";

/** Nothing for an active account: the badge exists to mark the exceptions. */
export function AccountLifecycleBadge({
  lifecycle,
  closesAt,
}: {
  lifecycle: AccountLifecycle | undefined;
  closesAt: string | null | undefined;
}) {
  if (!lifecycle || lifecycle === "ACTIVE") return null;
  const detail =
    lifecycle === "RETIREMENT_SCHEDULED" && closesAt ? `closes ${formatDate(closesAt)}` : undefined;
  return <StateBadge state={lifecycle} kind="account lifecycle" detail={detail} />;
}
