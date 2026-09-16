import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "#/features/dashboard/dashboard-page";
import { compactSearch, parseDashboardSearch } from "#/lib/time-range";

export const Route = createFileRoute("/_shell/")({
  validateSearch: parseDashboardSearch,
  component: DashboardRoute,
});

function DashboardRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <DashboardPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: compactSearch(next), replace: true });
      }}
    />
  );
}
