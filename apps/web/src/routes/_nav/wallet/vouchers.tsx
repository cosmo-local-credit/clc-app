import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { AllVouchersPage } from "#/features/wallet/ui";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

const AllVouchersDesk = lazy(() =>
  import("#/desktop/wallet/all-vouchers-desk").then((module) => ({
    default: module.AllVouchersDesk,
  })),
);

export const Route = createFileRoute("/_nav/wallet/vouchers")({
  staticData: { navOwner: "wallet", desktop: "fill" },
  validateSearch: z.object({
    voucher: z.string().optional().catch(undefined),
    /**
     * Desktop list keeps the voucher in the inspector. Old card links omit
     * this and still redirect to the voucher page.
     */
    panel: z.literal("open").optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    const voucherAddress = parseVoucherAddress(search.voucher);
    if (voucherAddress && search.panel === "open") return;
    if (voucherAddress) {
      throw redirect({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress },
        search: { from: "vouchers" },
        replace: true,
      });
    }
    if (search.voucher !== undefined || search.panel !== undefined) {
      throw redirect({ to: "/wallet/vouchers", search: {}, replace: true });
    }
  },
  component: AllVouchersRoute,
});

function AllVouchersRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<AllVouchersPage />} desktop={<AllVouchersDesk />} />
    </AuthenticatedRoute>
  );
}
