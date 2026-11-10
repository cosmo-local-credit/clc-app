import { createFileRoute, redirect } from "@tanstack/react-router";
import { AbuseReportsPage } from "#/features/messaging/abuse-reports-page";
import { parseAbuseReportSearch } from "#/features/messaging/messaging-search";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";

export const Route = createFileRoute("/_shell/abuse-reports")({
  validateSearch: parseAbuseReportSearch,
  beforeLoad: () => {
    if (!MESSAGING_ENABLED) throw redirect({ to: "/", replace: true });
  },
  component: () => <AbuseReportsPage search={Route.useSearch()} />,
});
