import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { sendReceiptSearchSchema } from "#/features/wallet/send-receipt-search";
import { SendReceiptPage } from "#/features/wallet/ui";

const SendReceiptDesk = lazy(() =>
  import("#/desktop/wallet/send-receipt-desk").then((module) => ({
    default: module.SendReceiptDesk,
  })),
);

export const Route = createFileRoute("/wallet/send/receipt")({
  staticData: { desktop: "fill" },
  validateSearch: sendReceiptSearchSchema,
  component: SendReceiptRoute,
});

function SendReceiptRoute() {
  const search = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<SendReceiptPage {...search} />} desktop={<SendReceiptDesk />} />
    </AuthenticatedRoute>
  );
}
