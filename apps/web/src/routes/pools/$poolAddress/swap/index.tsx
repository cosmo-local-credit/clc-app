import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { PoolSwapPage } from "#/features/pools/ui";

const PoolDesk = lazy(() =>
  import("#/desktop/pools/pool-desk").then((module) => ({ default: module.PoolDesk })),
);

const searchSchema = z.object({
  /** Voucher address to open the "You receive" side on. */
  receive: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/pools/$poolAddress/swap/")({
  staticData: { desktop: "fill" },
  validateSearch: searchSchema,
  component: PoolSwapRoute,
});

function PoolSwapRoute() {
  const { poolAddress } = Route.useParams();
  const { receive } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<PoolSwapPage poolAddress={poolAddress} receiveTokenAddress={receive} />}
        desktop={<PoolDesk poolAddress={poolAddress} swapActive />}
      />
    </AuthenticatedRoute>
  );
}
