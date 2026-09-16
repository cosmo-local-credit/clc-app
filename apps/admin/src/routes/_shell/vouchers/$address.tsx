import { createFileRoute } from "@tanstack/react-router";
import { VoucherDetailPage } from "#/features/vouchers/voucher-detail-page";
import { parseVoucherDetailSearch } from "#/features/vouchers/voucher-detail-search";

export const Route = createFileRoute("/_shell/vouchers/$address")({
  validateSearch: parseVoucherDetailSearch,
  component: VoucherDetailRoute,
});

function VoucherDetailRoute() {
  const { address } = Route.useParams();
  const search = Route.useSearch();
  return <VoucherDetailPage address={address} search={search} />;
}
