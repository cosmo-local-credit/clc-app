import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { swapReceiptSearchSchema } from "#/features/pools/swap-receipt-search";
import { SwapReceiptPage } from "#/features/pools/ui";

const SwapReceiptDesk = lazy(() =>
  import("#/desktop/pools/swap-receipt-desk").then((module) => ({
    default: module.SwapReceiptDesk,
  })),
);

export const Route = createFileRoute("/pools/$poolAddress/swap/receipt")({
  staticData: { desktop: "fill" },
  validateSearch: swapReceiptSearchSchema,
  component: SwapReceiptRoute,
});

function SwapReceiptRoute() {
  const { poolAddress } = Route.useParams();
  const details = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<SwapReceiptPage poolAddress={poolAddress} details={details} />}
        desktop={<SwapReceiptDesk poolAddress={poolAddress} details={details} />}
      />
    </AuthenticatedRoute>
  );
}
