import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { TokenDetailPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/tokens/$tokenId")({
  component: TokenDetailRoute,
});

function TokenDetailRoute() {
  const { tokenId } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <TokenDetailPage tokenId={tokenId} />
    </AuthenticatedRoute>
  );
}
