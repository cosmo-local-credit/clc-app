import { createFileRoute } from "@tanstack/react-router";

import { SendRecipientPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/send/")({
  component: SendRecipientRoute,
});

function SendRecipientRoute() {
  return <SendRecipientPage />;
}
