import { createFileRoute } from "@tanstack/react-router";
import { RetirementRequestsPage } from "#/features/retirement/retirement-requests-page";
import { parseRetirementSearch } from "#/features/retirement/retirement-search";

export const Route = createFileRoute("/_shell/retirement-requests/")({
  validateSearch: parseRetirementSearch,
  component: () => <RetirementRequestsPage search={Route.useSearch()} />,
});
