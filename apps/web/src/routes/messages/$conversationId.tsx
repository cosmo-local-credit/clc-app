import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { ThreadPage } from "#/features/messaging/ui/thread-page";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";

const ConversationDesk = lazy(() =>
  import("#/desktop/messaging/conversation-desk").then((module) => ({
    default: module.ConversationDesk,
  })),
);

// Outside the tab shell: the composer sits where the bottom navigation would.
// On the desktop the thread opens beside its inbox, in Activity.
export const Route = createFileRoute("/messages/$conversationId")({
  staticData: { desktop: "fill" },
  beforeLoad: ({ params }) => {
    if (!MESSAGING_ENABLED) throw redirect({ to: "/", search: { tab: "activity" }, replace: true });
    if (!/^[1-9][0-9]{0,15}$/.test(params.conversationId)) {
      throw redirect({ to: "/", search: { tab: "activity", section: "messages" }, replace: true });
    }
  },
  component: ThreadRoute,
});

function ThreadRoute() {
  const { conversationId } = Route.useParams();
  const id = Number(conversationId);
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<ThreadPage key={conversationId} conversationId={id} />}
        desktop={<ConversationDesk conversationId={id} />}
      />
    </AuthenticatedRoute>
  );
}
