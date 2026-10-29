import { createFileRoute } from "@tanstack/react-router";
import { DeploymentsPage } from "#/features/deployments/deployments-page";
import { parseTableSearch } from "#/lib/table-search";

export const Route = createFileRoute("/_shell/deployments")({
  validateSearch: parseTableSearch,
  component: function DeploymentsRoute() {
    return <DeploymentsPage search={Route.useSearch()} />;
  },
});
