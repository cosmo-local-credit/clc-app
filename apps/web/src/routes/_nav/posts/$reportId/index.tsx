import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { ReportPage } from "#/features/home/ui/report-page";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/posts/$reportId/")({
  staticData: { navOwner: "posts" },
  validateSearch: z.object({ voucher: z.string().optional().catch(undefined) }),
  beforeLoad: ({ params, search }) => {
    const voucherAddress = parseVoucherAddress(search.voucher);
    if (voucherAddress) {
      throw redirect({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress },
        search: { from: "posts", reportId: params.reportId },
        replace: true,
      });
    }
    if (search.voucher !== undefined) {
      throw redirect({
        to: "/posts/$reportId",
        params: { reportId: params.reportId },
        search: {},
        replace: true,
      });
    }
  },
  component: ReportRoute,
});

function ReportRoute() {
  const { reportId } = Route.useParams();
  return (
    <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
      <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
        <ReportPage reportId={reportId} />
      </main>
    </div>
  );
}
