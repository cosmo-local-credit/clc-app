import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ReportPage } from "#/features/home/ui/report-page";
import { voucherSheetSearchShape } from "#/lib/navigation/voucher-sheet-search";

export const Route = createFileRoute("/_nav/posts/$reportId/")({
  staticData: { navOwner: "posts" },
  validateSearch: z.object(voucherSheetSearchShape),
  component: ReportRoute,
});

function ReportRoute() {
  const { reportId } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <ReportPage reportId={reportId} />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
