import { createFileRoute, redirect } from "@tanstack/react-router";
import { HelpdeskQueuePage } from "#/features/messaging/helpdesk-queue-page";
import { parseHelpdeskSearch } from "#/features/messaging/messaging-search";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";

export const Route = createFileRoute("/_shell/helpdesk/")({
  validateSearch: parseHelpdeskSearch,
  beforeLoad: () => {
    if (!MESSAGING_ENABLED) throw redirect({ to: "/", replace: true });
  },
  component: () => <HelpdeskQueuePage search={Route.useSearch()} />,
});
