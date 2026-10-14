import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { AllVouchersPage } from "#/features/wallet/ui";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/wallet/vouchers")({
  staticData: { navOwner: "wallet" },
  validateSearch: z.object({ voucher: z.string().optional().catch(undefined) }),
  beforeLoad: ({ search }) => {
    const voucherAddress = parseVoucherAddress(search.voucher);
    if (voucherAddress) {
      throw redirect({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress },
        search: { from: "vouchers" },
        replace: true,
      });
    }
    if (search.voucher !== undefined) {
      throw redirect({ to: "/wallet/vouchers", search: {}, replace: true });
    }
  },
  component: AllVouchersRoute,
});

function AllVouchersRoute() {
  return (
    <AuthenticatedRoute>
      <AllVouchersPage />
    </AuthenticatedRoute>
  );
}
