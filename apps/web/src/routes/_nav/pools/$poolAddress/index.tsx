import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolDetailPage } from "#/features/pools/ui";

const searchSchema = z.object({
  voucher: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/pools/$poolAddress/")({
  staticData: { navOwner: "wallet" },
  validateSearch: searchSchema,
  component: PoolDetailRoute,
});

function PoolDetailRoute() {
  const { poolAddress } = Route.useParams();
  const { voucher } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AuthenticatedRoute>
      <PoolDetailPage
        poolAddress={poolAddress}
        selectedVoucherAddress={voucher}
        onSelectVoucher={(address) => {
          void navigate({
            search: { voucher: address },
            replace: true,
            resetScroll: false,
          });
        }}
        onClearVoucher={() => {
          void navigate({ search: {}, replace: true, resetScroll: false });
        }}
      />
    </AuthenticatedRoute>
  );
}
