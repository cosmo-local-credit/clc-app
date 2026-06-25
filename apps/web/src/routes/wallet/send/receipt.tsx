import { createFileRoute } from "@tanstack/react-router";

import { SendReceiptPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/send/receipt")({
  component: SendReceiptRoute,
});

function SendReceiptRoute() {
  return <SendReceiptPage />;
}
