import { createFileRoute } from "@tanstack/react-router";

import { SendAmountPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/send/amount")({
  component: SendAmountRoute,
});

function SendAmountRoute() {
  return <SendAmountPage />;
}
