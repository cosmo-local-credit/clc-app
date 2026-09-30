import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SendReceiptPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  token: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional()
    .catch(undefined),
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
  const { trackingId, recipient, amount, symbol, token, returnPool } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SendReceiptPage
        token={token}
        trackingId={trackingId}
        recipient={recipient}
        amount={amount}
        symbol={symbol}
        returnPool={returnPool}
      />
    </AuthenticatedRoute>
  );
}
