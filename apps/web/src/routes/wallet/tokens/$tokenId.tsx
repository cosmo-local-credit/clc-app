import { createFileRoute } from "@tanstack/react-router";

import { TokenDetailPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/tokens/$tokenId")({
  component: TokenDetailRoute,
});

function TokenDetailRoute() {
  const { tokenId } = Route.useParams();
  return <TokenDetailPage tokenId={tokenId} />;
}
