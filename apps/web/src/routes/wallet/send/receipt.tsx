import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SendReceiptPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/send/receipt")({
  component: SendReceiptRoute,
});

function SendReceiptRoute() {
  return (
    <AuthenticatedRoute>
      <SendReceiptPage />
    </AuthenticatedRoute>
  );
}
