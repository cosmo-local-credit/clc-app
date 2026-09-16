import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SendReceiptPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  trackingId: z.string().optional().catch(undefined),
  recipient: z.string().optional().catch(undefined),
  amount: z.string().optional().catch(undefined),
  symbol: z.string().optional().catch(undefined),
  /** Pool the send started from, so Done returns there instead of the wallet. */
  returnPool: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/send/receipt")({
  validateSearch: searchSchema,
  component: SendReceiptRoute,
});

function SendReceiptRoute() {
  const { trackingId, recipient, amount, symbol, returnPool } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SendReceiptPage
        trackingId={trackingId}
        recipient={recipient}
        amount={amount}
        symbol={symbol}
        returnPool={returnPool}
      />
    </AuthenticatedRoute>
  );
}
