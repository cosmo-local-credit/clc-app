import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { AllVouchersPage } from "#/features/wallet/ui";
import { voucherSheetSearchShape } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/wallet/vouchers")({
  staticData: { navOwner: "wallet" },
  validateSearch: z.object(voucherSheetSearchShape),
  component: AllVouchersRoute,
});

function AllVouchersRoute() {
  return (
    <AuthenticatedRoute>
      <AllVouchersPage />
    </AuthenticatedRoute>
  );
}
