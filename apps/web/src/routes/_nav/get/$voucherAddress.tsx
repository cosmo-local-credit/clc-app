import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreditGetPage } from "#/features/credit/ui";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/get/$voucherAddress")({
  staticData: { navOwner: "voucher" },
  component: CreditGetRoute,
});

function CreditGetRoute() {
  const { voucherAddress } = Route.useParams();
  const address = parseVoucherAddress(voucherAddress);
  return (
    <AuthenticatedRoute>
      {address ? <CreditGetPage voucherAddress={address} /> : null}
    </AuthenticatedRoute>
  );
}
