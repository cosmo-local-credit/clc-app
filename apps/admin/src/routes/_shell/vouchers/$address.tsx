import { createFileRoute } from "@tanstack/react-router";
import { VoucherDetailPage } from "#/features/vouchers/voucher-detail-page";

export const Route = createFileRoute("/_shell/vouchers/$address")({
  component: () => <VoucherDetailPage address={Route.useParams().address} />,
});
