import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreditGetPage } from "#/features/credit/ui";
import { creditDepthSearchParam } from "#/lib/navigation/credit-depth-search";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/get/$voucherAddress")({
  staticData: { navOwner: "voucher" },
  validateSearch: z.object({ creditDepth: creditDepthSearchParam }),
  search: { middlewares: [retainSearchParams(["creditDepth"])] },
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
