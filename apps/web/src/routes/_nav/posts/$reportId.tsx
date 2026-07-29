import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ReportPage } from "#/features/home/ui/report-page";

export const Route = createFileRoute("/_nav/posts/$reportId")({
  staticData: { navOwner: "posts" },
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
