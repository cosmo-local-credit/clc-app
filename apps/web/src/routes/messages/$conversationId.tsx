import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { ThreadPage } from "#/features/messaging/ui/thread-page";
import { MESSAGING_ENABLED } from "#/lib/messaging-config";
import { parseActivityMessageContext } from "#/lib/navigation/activity-search";

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
  validateSearch: (search) => ({
    messageKind: typeof search.messageKind === "string" ? search.messageKind : undefined,
    messageResource:
      typeof search.messageResource === "string" ? search.messageResource : undefined,
    messageVoucher: typeof search.messageVoucher === "string" ? search.messageVoucher : undefined,
  }),
  component: ThreadRoute,
});

function ThreadRoute() {
  const { conversationId } = Route.useParams();
  const id = Number(conversationId);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const initialContext = parseActivityMessageContext(search);
  const clearContext = () =>
    navigate({
      to: "/messages/$conversationId",
      params: { conversationId },
      search: {},
      replace: true,
    });
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={
          <ThreadPage
            key={conversationId}
            conversationId={id}
            initialContext={initialContext}
            onContextSent={clearContext}
          />
        }
        desktop={
          <ConversationDesk
            conversationId={id}
            initialContext={initialContext}
            onContextSent={clearContext}
          />
        }
      />
    </AuthenticatedRoute>
  );
}
