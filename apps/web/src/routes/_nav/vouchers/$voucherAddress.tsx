import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { VoucherDetailPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  tab: z.enum(["offerings", "activity", "info", "reviews", "posts"]).optional().catch(undefined),
  /** Screen the voucher was opened from; names the Back chevron. */
  from: z.enum(["market", "posts", "wallet", "vouchers"]).optional().catch(undefined),
  poolAddress: z.string().optional().catch(undefined),
  reportId: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/vouchers/$voucherAddress")({
  staticData: { navOwner: "voucher" },
  validateSearch: searchSchema,
  component: VoucherDetailRoute,
});

function VoucherDetailRoute() {
  const { voucherAddress } = Route.useParams();
  const { from, poolAddress, reportId, tab } = Route.useSearch();
  return (
    <VoucherDetailPage
      voucherAddress={voucherAddress}
      activeTab={tab}
      origin={from ?? "market"}
      poolAddress={poolAddress}
      reportId={reportId}
    />
  );
}
