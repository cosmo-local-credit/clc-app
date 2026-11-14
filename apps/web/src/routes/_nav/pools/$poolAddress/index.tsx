import { createFileRoute, redirect, retainSearchParams } from "@tanstack/react-router";
import { creditSearch } from "#/lib/navigation/credit-search";
import { lazy, useEffect } from "react";
import { z } from "zod";

import { LayoutSwitch } from "#/desktop/switch";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { PoolDetailPage } from "#/features/pools/ui";

const PoolDesk = lazy(() =>
  import("#/desktop/pools/pool-desk").then((module) => ({ default: module.PoolDesk })),
);
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

const searchSchema = z.object({
  tab: z
    .enum(["offerings", "wants", "vouchers", "holdings", "credit", "activity", "info"])
    .optional()
    .catch(undefined),
  voucher: z.string().optional().catch(undefined),
  wantId: z.string().trim().min(1).optional().catch(undefined),
  /** The desktop Activity tab's kinds, comma separated, as the wallet's Activity takes them. */
  activityTypes: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_nav/pools/$poolAddress/")({
  staticData: { navOwner: "wallet", desktop: "fill" },
  validateSearch: (search: Record<string, unknown>) => ({
    ...searchSchema.parse(search),
    ...creditSearch(search),
  }),
  search: { middlewares: [retainSearchParams(["credit"])] },
  beforeLoad: ({ params, search }) => {
    const voucherAddress = parseVoucherAddress(search.voucher);
    if (voucherAddress) {
      throw redirect({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress },
        search: { poolAddress: params.poolAddress },
        replace: true,
      });
    }
    if (search.voucher !== undefined) {
      throw redirect({
        to: "/pools/$poolAddress",
        params: { poolAddress: params.poolAddress },
        search: { tab: search.tab === "vouchers" ? "holdings" : search.tab },
        replace: true,
      });
    }
    if (search.tab === "vouchers") {
      throw redirect({
        to: "/pools/$poolAddress",
        params: { poolAddress: params.poolAddress },
        search: { ...search, tab: "holdings", voucher: undefined },
        replace: true,
      });
    }
  },
  component: PoolDetailRoute,
});

function PoolDetailRoute() {
  const { poolAddress } = Route.useParams();
  const { tab, wantId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const auth = useAuthStatus();
  // `tab=vouchers` remains parseable only so old links can be canonicalized by
  // `beforeLoad`; Holdings is its complete replacement.
  const requested = tab === "vouchers" ? "holdings" : (tab ?? "offerings");
  const activeTab =
    auth.isAuthenticated ||
    requested === "offerings" ||
    requested === "wants" ||
    requested === "holdings" ||
    requested === "info"
      ? requested
      : "offerings";

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && requested !== activeTab) {
      void navigate({
        to: "/pools/$poolAddress",
        params: { poolAddress },
        search: {},
        replace: true,
      });
    }
  }, [activeTab, auth.isAuthenticated, auth.isLoading, navigate, poolAddress, requested]);

  return (
    <LayoutSwitch
      mobile={
        <div className="min-h-[100svh] bg-background pb-bottom-nav text-foreground">
          <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
            <PoolDetailPage poolAddress={poolAddress} activeTab={activeTab} wantId={wantId} />
          </main>
        </div>
      }
      desktop={<PoolDesk poolAddress={poolAddress} />}
    />
  );
}
