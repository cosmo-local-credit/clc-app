import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SwapReceiptPage } from "#/features/pools/ui";

const searchSchema = z.object({
  trackingId: z.string().optional().catch(undefined),
  sendAmount: z.string().optional().catch(undefined),
  sendAmountRaw: z.string().regex(/^\d+$/).optional().catch(undefined),
  sendSymbol: z.string().optional().catch(undefined),
  sendToken: z.string().optional().catch(undefined),
  receiveAmount: z.string().optional().catch(undefined),
  receiveAmountRaw: z.string().regex(/^\d+$/).optional().catch(undefined),
  receiveSymbol: z.string().optional().catch(undefined),
  /** Contract address of the received voucher, so the receipt can prefill a send. */
  receiveToken: z.string().optional().catch(undefined),
  poolName: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/pools/$poolAddress/swap/receipt")({
  validateSearch: searchSchema,
  component: SwapReceiptRoute,
});

function SwapReceiptRoute() {
  const { poolAddress } = Route.useParams();
  const details = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SwapReceiptPage poolAddress={poolAddress} details={details} />
    </AuthenticatedRoute>
  );
}
