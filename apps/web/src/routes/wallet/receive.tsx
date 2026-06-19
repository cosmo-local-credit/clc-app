import { createFileRoute } from "@tanstack/react-router";

import { ReceivePage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  return <ReceivePage />;
}
