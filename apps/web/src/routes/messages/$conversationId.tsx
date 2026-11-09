import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ThreadPage } from "#/features/messaging/ui/thread-page";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";

// Outside the tab shell: the composer sits where the bottom navigation would.
export const Route = createFileRoute("/messages/$conversationId")({
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
  return (
    <AuthenticatedRoute>
      <ThreadPage key={conversationId} conversationId={Number(conversationId)} />
    </AuthenticatedRoute>
  );
}
