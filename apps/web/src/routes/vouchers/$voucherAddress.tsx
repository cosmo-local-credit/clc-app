import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { VoucherDetailPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  tab: z.enum(["offerings", "activity", "info", "reviews"]).optional().catch(undefined),
  poolAddress: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/vouchers/$voucherAddress")({
  validateSearch: searchSchema,
  component: VoucherDetailRoute,
});

function VoucherDetailRoute() {
  const { voucherAddress } = Route.useParams();
  const { poolAddress, tab } = Route.useSearch();
  return (
    <VoucherDetailPage
      voucherAddress={voucherAddress}
      activeTab={tab ?? "offerings"}
      poolAddress={poolAddress}
    />
  );
}
