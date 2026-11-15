import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { lazy } from "react";

import { LayoutSwitch } from "#/desktop/switch";
import { useCreditGet } from "#/features/credit/hooks/use-credit-get";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CreditGetPage } from "#/features/credit/ui";
import { creditSearch } from "#/lib/navigation/credit-search";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

const CreditGetDesk = lazy(() =>
  import("#/desktop/credit/get-desk").then((module) => ({ default: module.CreditGetDesk })),
);

export const Route = createFileRoute("/_nav/get/$voucherAddress")({
  staticData: { navOwner: "voucher", desktop: "fill" },
  validateSearch: creditSearch,
  search: { middlewares: [retainSearchParams(["credit"])] },
  component: CreditGetRoute,
});

function CreditGetRoute() {
  const { voucherAddress } = Route.useParams();
  const address = parseVoucherAddress(voucherAddress);
  return (
    <AuthenticatedRoute>
      {address ? <CreditGetViews key={address} voucherAddress={address} /> : null}
    </AuthenticatedRoute>
  );
}

function CreditGetViews({ voucherAddress }: { voucherAddress: `0x${string}` }) {
  const get = useCreditGet(voucherAddress);
  return (
    <LayoutSwitch
      mobile={<CreditGetPage voucherAddress={voucherAddress} get={get} />}
      desktop={<CreditGetDesk voucherAddress={voucherAddress} get={get} />}
    />
  );
}
