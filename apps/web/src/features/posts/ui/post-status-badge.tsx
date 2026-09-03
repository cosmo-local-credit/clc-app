import type { ReportStatus } from "@clc/core/features/reports/logic";
import { useLingui } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";

/**
 * What state a post is in, in the author's words.
 *
 * "Awaiting approval" rather than "Submitted": the author has already submitted
 * it, and what they need to know is that someone else has to act next. Draft and
 * Rejected are legacy states nothing in this release creates, but imported rows
 * hold them and a row with no label would look broken.
 */
export function PostStatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useLingui();

  const label = {
    DRAFT: t`Draft`,
    SUBMITTED: t`Awaiting approval`,
    APPROVED: t`Approved`,
    REJECTED: t`Not approved`,
  }[status];

  return (
    <Badge variant={status === "APPROVED" ? "primary" : "muted"} className="max-w-full truncate">
      {label}
    </Badge>
  );
}
