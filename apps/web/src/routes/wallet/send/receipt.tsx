import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { sendReceiptSearchSchema } from "#/features/wallet/send-receipt-search";
import { SendReceiptPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/send/receipt")({
  validateSearch: sendReceiptSearchSchema,
  component: SendReceiptRoute,
});

function SendReceiptRoute() {
  const {
    trackingId,
    recipient,
    recipientLabel,
    amount,
    symbol,
    token,
    uoaValue,
    uoa,
    uoaUnavailable,
    returnPool,
  } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SendReceiptPage
        token={token}
        trackingId={trackingId}
        recipient={recipient}
        recipientLabel={recipientLabel}
        amount={amount}
        symbol={symbol}
        uoaValue={uoaValue}
        uoa={uoa}
        uoaUnavailable={uoaUnavailable}
        returnPool={returnPool}
      />
    </AuthenticatedRoute>
  );
}
