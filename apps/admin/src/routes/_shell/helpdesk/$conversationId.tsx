import { createFileRoute, redirect } from "@tanstack/react-router";
import { HelpdeskThreadPage } from "#/features/messaging/helpdesk-thread-page";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";

export const Route = createFileRoute("/_shell/helpdesk/$conversationId")({
  beforeLoad: () => {
    if (!MESSAGING_ENABLED) throw redirect({ to: "/", replace: true });
  },
  component: () => <HelpdeskThreadPage conversationId={Route.useParams().conversationId} />,
});
