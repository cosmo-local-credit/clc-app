import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { VoucherDetailPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  tab: z.enum(["offerings", "activity", "info", "reviews"]).optional().catch(undefined),
  /** Screen the voucher was opened from; names the Back chevron. */
  from: z.enum(["market", "wallet", "vouchers"]).optional().catch(undefined),
  poolAddress: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/vouchers/$voucherAddress")({
  validateSearch: searchSchema,
  component: VoucherDetailRoute,
});

function VoucherDetailRoute() {
  const { voucherAddress } = Route.useParams();
  const { from, poolAddress, tab } = Route.useSearch();
  return (
    <VoucherDetailPage
      voucherAddress={voucherAddress}
      activeTab={tab ?? "offerings"}
      origin={from ?? "market"}
      poolAddress={poolAddress}
    />
  );
}
