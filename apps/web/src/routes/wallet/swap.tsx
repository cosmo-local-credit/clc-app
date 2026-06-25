import { createFileRoute } from "@tanstack/react-router";

import { SwapPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/swap")({
  component: SwapRoute,
});

function SwapRoute() {
  return <SwapPage />;
}
