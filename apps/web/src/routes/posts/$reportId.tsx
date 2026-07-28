import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ReportPage } from "#/features/home/ui/report-page";

export const Route = createFileRoute("/posts/$reportId")({
  component: ReportRoute,
});

function ReportRoute() {
  const { reportId } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <ReportPage reportId={reportId} />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
