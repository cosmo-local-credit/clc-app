import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { LayoutSwitch } from "#/desktop/switch";
import { VoucherDetailPage } from "#/features/wallet/ui";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

const VoucherDesk = lazy(() =>
  import("#/desktop/vouchers/voucher-desk").then((module) => ({ default: module.VoucherDesk })),
);

const searchSchema = z.object({
  tab: z.enum(["offerings", "activity", "info", "reviews", "posts"]).optional().catch(undefined),
  /** Screen the voucher was opened from; names the Back chevron. */
  from: z.enum(["market", "posts", "wallet", "vouchers", "wants"]).optional().catch(undefined),
  poolAddress: z.string().optional().catch(undefined),
  reportId: z.string().trim().min(1).optional().catch(undefined),
  wantId: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/vouchers/$voucherAddress")({
  staticData: { navOwner: "voucher", desktop: "fill" },
  validateSearch: searchSchema,
  component: VoucherDetailRoute,
});

function VoucherDetailRoute() {
  const { voucherAddress } = Route.useParams();
  const { from, poolAddress, reportId, tab, wantId } = Route.useSearch();
  const address = parseVoucherAddress(voucherAddress);
  const mobile = (
    <VoucherDetailPage
      voucherAddress={voucherAddress}
      activeTab={tab}
      origin={from ?? "market"}
      poolAddress={poolAddress}
      reportId={reportId}
      wantId={wantId}
    />
  );
  return (
    <LayoutSwitch
      mobile={mobile}
      desktop={address ? <VoucherDesk voucherAddress={address} /> : mobile}
    />
  );
}
