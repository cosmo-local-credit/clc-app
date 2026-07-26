import { createFileRoute } from "@tanstack/react-router";

import { VoucherDetailPage } from "#/features/home/ui/voucher-detail-page";

export const Route = createFileRoute("/vouchers/$voucherAddress")({
  component: VoucherDetailRoute,
});

// Public, like the Market tab it is reached from: a shared voucher link must
// open for a signed-out visitor, so this route is deliberately not wrapped in
// AuthenticatedRoute.
function VoucherDetailRoute() {
  const { voucherAddress } = Route.useParams();
  return <VoucherDetailPage voucherAddress={voucherAddress} />;
}
