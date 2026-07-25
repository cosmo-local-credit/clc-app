import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { TokenDetailPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  poolAddress: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/tokens/$tokenId")({
  validateSearch: searchSchema,
  component: TokenDetailRoute,
});

function TokenDetailRoute() {
  const { tokenId } = Route.useParams();
  const { poolAddress } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <TokenDetailPage tokenId={tokenId} poolAddress={poolAddress} />
    </AuthenticatedRoute>
  );
}
