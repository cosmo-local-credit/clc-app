import { createFileRoute } from "@tanstack/react-router";

import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolSwapPage } from "#/features/pools/ui";

const searchSchema = z.object({
  /** Voucher address to open the "You receive" side on. */
  receive: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/pools/$poolAddress/swap/")({
  validateSearch: searchSchema,
  component: PoolSwapRoute,
});

function PoolSwapRoute() {
  const { poolAddress } = Route.useParams();
  const { receive } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <PoolSwapPage poolAddress={poolAddress} receiveTokenAddress={receive} />
    </AuthenticatedRoute>
  );
}
