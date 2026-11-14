import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreditGetPage } from "#/features/credit/ui";
import { creditSearch } from "#/lib/navigation/credit-search";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/get/$voucherAddress")({
  staticData: { navOwner: "voucher" },
  validateSearch: creditSearch,
  search: { middlewares: [retainSearchParams(["credit"])] },
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
