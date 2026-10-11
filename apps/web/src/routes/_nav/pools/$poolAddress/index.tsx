import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { PoolDetailPage } from "#/features/pools/ui";
import { voucherSheetSearchShape } from "#/lib/navigation/voucher-sheet-search";

const searchSchema = z.object({
  tab: z
    .enum(["offerings", "vouchers", "holdings", "credit", "activity"])
    .optional()
    .catch(undefined),
  ...voucherSheetSearchShape,
});

export const Route = createFileRoute("/_nav/pools/$poolAddress/")({
  staticData: { navOwner: "wallet" },
  validateSearch: searchSchema,
  component: PoolDetailRoute,
});

function PoolDetailRoute() {
  const { poolAddress } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const auth = useAuthStatus();
  const requested = tab ?? "offerings";
  const activeTab =
    auth.isAuthenticated || requested === "offerings" || requested === "vouchers"
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
    <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
      <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
        <PoolDetailPage poolAddress={poolAddress} activeTab={activeTab} />
      </main>
    </div>
  );
}
